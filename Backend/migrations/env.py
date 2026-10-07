"""Alembic environment, wired to the application settings.

The database URL comes from app.config, so migrations always target the same
database the application uses and no connection string is stored in
alembic.ini.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# Importing the package registers every model on Base.metadata.
import app.models  # noqa: F401
from app.config import get_settings
from app.database import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().database_url)

target_metadata = Base.metadata


def render_item(type_, obj, autogen_context):
    """Render custom column types as their underlying SQL types.

    StrEnumType and UTCDateTime are TypeDecorators whose DDL is plain
    VARCHAR/DATETIME. Alembic would otherwise emit `app.models.base.StrEnumType`
    into the migration, which fails at import: migration files deliberately do
    not import application models, because a migration is a frozen historical
    record and the model it was generated from will keep changing.
    """
    if type_ == "type":
        name = type(obj).__name__
        if name == "StrEnumType":
            autogen_context.imports.add("import sqlalchemy as sa")
            return f"sa.String(length={obj.length})"
        if name == "UTCDateTime":
            autogen_context.imports.add("import sqlalchemy as sa")
            return "sa.DateTime(timezone=True)"
    return False


def run_migrations_offline() -> None:
    """Emit SQL to stdout without connecting."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_item=render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        render_item=render_item,
        # SQLite cannot ALTER most columns in place; batch mode rewrites the
        # table instead. Harmless on PostgreSQL.
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
