"""Shared column helpers for ORM models."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator


def new_id() -> str:
    """String UUID primary key. Portable across SQLite and PostgreSQL."""
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class StrEnumType(TypeDecorator):
    """Persist a StrEnum by value, and read it back as the enum.

    A bare String column returns plain strings, which silently breaks any code
    doing identity comparisons or ordinal arithmetic on the level scale. The
    underlying DDL is still VARCHAR, so this changes no migration.
    """

    impl = String
    cache_ok = True

    def __init__(self, enum_cls: type[Enum], length: int = 32, **kwargs) -> None:
        self.enum_cls = enum_cls
        super().__init__(length=length, **kwargs)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, Enum):
            return value.value
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return self.enum_cls(value)


class UTCDateTime(TypeDecorator):
    """Always hand back timezone-aware UTC datetimes.

    SQLite has no native timezone support and returns naive values, which then
    blow up any arithmetic against an aware `now`. Normalising here keeps the
    scoring engine free of storage-backend quirks.
    """

    impl = DateTime
    cache_ok = True

    def __init__(self, **kwargs) -> None:
        kwargs.setdefault("timezone", True)
        super().__init__(**kwargs)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class TenantScoped:
    """Mixin adding the mandatory tenant boundary (thesis 24).

    Every queryable row must be filterable by tenant. Indexed because every
    read path filters on it.
    """

    tenant_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)


class Timestamped:
    """Mixin adding creation and update timestamps."""

    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, onupdate=utcnow, nullable=False
    )
