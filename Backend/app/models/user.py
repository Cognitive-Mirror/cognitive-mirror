"""User model. Identity comes from Firebase; this table holds org context."""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TenantScoped, Timestamped, new_id


class User(Base, TenantScoped, Timestamped):
    """A person in a tenant.

    Passwords are never stored here. Authentication is Firebase; this record
    exists to carry role, manager relationship and org unit.
    """

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("firebase_uid", name="uq_users_firebase_uid"),
        UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    firebase_uid: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), default="")

    # learner | manager | admin
    role: Mapped[str] = mapped_column(String(32), default="learner", nullable=False)

    # Self-referential: the manager who validates this person's evidence.
    manager_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    org_unit: Mapped[str | None] = mapped_column(String(120), nullable=True)
    role_ref: Mapped[str | None] = mapped_column(
        String(120), nullable=True,
        doc="Job role identifier, used to resolve required_level (D6 layer 2).",
    )
    program_ref: Mapped[str | None] = mapped_column(
        String(120), nullable=True,
        doc=(
            "Programme the user is currently enrolled in, used to resolve "
            "required_level (D6 layer 3). A single field is a simplification; "
            "real cohort membership belongs in its own table."
        ),
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
