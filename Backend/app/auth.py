"""Authentication and identity for FastAPI.

`verify_token` checks the Firebase ID token in `Authorization: Bearer <token>`.
`current_user` maps it to the caller's `users` row; routes depend on that.

Security note
-------------
There is a development-only path that decodes a token WITHOUT verifying its
signature. Unsigned decoding means any attacker can mint a token claiming to be
any user, so it is gated behind an explicit opt-in flag that Settings refuses to
honour outside `ENVIRONMENT=development`. It is off by default.
"""

from __future__ import annotations

import logging
from pathlib import Path

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth, credentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import Role, User

logger = logging.getLogger(__name__)

_UNAUTHORIZED_HEADERS = {"WWW-Authenticate": "Bearer"}


def _initialise_firebase() -> None:
    """Initialise the Firebase Admin SDK exactly once."""
    if firebase_admin._apps:
        return

    settings = get_settings()
    options = {"projectId": settings.firebase_project_id}

    service_account_path = settings.google_application_credentials
    if service_account_path and Path(service_account_path).exists():
        firebase_admin.initialize_app(
            credentials.Certificate(service_account_path),
            options=options,
        )
        logger.info("Firebase Admin initialised with a service account.")
    else:
        # Verifying an ID token needs only the project id and Google's public
        # signing certificates - no credential. Without this, the SDK searches
        # for Application Default Credentials on every call (a ~12 s metadata
        # probe off Google Cloud), then fails BEFORE verifying anything, which
        # pushed every real login onto the unverified development path.
        firebase_admin.initialize_app(_VerifyOnlyCredential(), options=options)
        logger.info(
            "Firebase Admin initialised for ID-token verification only (no "
            "service account). Admin APIs such as user management are unavailable."
        )


class _VerifyOnlyCredential(credentials.Base):
    """Anonymous credential: enough for verify_id_token, nothing else."""

    def get_credential(self):
        from google.auth.credentials import AnonymousCredentials

        return AnonymousCredentials()


_initialise_firebase()

security = HTTPBearer(auto_error=False)


def _decode_unverified(token: str) -> dict:
    """Decode a JWT without checking its signature. Development only."""
    import jwt  # imported lazily — only needed on the insecure path

    logger.warning(
        "SECURITY: accepting an ID token WITHOUT signature verification. "
        "This is a development-only path and must never run in production."
    )
    claims = jwt.decode(token, options={"verify_signature": False})
    if "uid" not in claims:
        claims["uid"] = claims.get("user_id") or claims.get("sub")
    return claims


async def verify_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """Extract and verify the Firebase ID token from the Authorization header."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token.",
            headers=_UNAUTHORIZED_HEADERS,
        )

    token = credentials.credentials

    try:
        return auth.verify_id_token(token)
    except Exception as exc:
        settings = get_settings()

        if settings.allow_insecure_token_fallback:
            try:
                return _decode_unverified(token)
            except Exception as decode_error:
                logger.warning("Unverified decode also failed: %s", decode_error)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication token.",
                    headers=_UNAUTHORIZED_HEADERS,
                ) from decode_error

        # Log the real reason server-side; do not leak it to the caller.
        logger.warning("Token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            headers=_UNAUTHORIZED_HEADERS,
        ) from exc


# --- Identity --------------------------------------------------------------
#
# Every route identifies the caller through `current_user`, which turns verified
# Firebase claims into the caller's `users` row. `User.id` is the one identity
# the rest of the system stores (evidence.learner_id, state.subject_id, ...);
# the Firebase uid is only a login handle. Tenant and role come from that row,
# never from the request.

DEFAULT_TENANT = "default"


async def current_user(
    claims: dict = Depends(verify_token),
    session: AsyncSession = Depends(get_db),
) -> User:
    uid = claims.get("uid") or claims.get("sub")
    if not uid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token carries no subject.")

    user = (
        await session.execute(select(User).where(User.firebase_uid == uid))
    ).scalar_one_or_none()
    if user is None:
        user = await _link_or_provision(session, uid, claims)
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is deactivated.")
    return user


async def _link_or_provision(session: AsyncSession, uid: str, claims: dict) -> User:
    """First sign-in: attach to a pre-created row by email, or create a learner.

    Linking by email lets an admin create someone's record (role, manager,
    programme) before they ever sign in. It is done only for a verified email -
    or in development, where demo accounts are unverified - because linking on
    an unverified address would let anyone claim another person's record.
    """
    tenant_id = claims.get("tenant_id") or DEFAULT_TENANT
    email = (claims.get("email") or "").lower()
    trusted = claims.get("email_verified") or get_settings().environment == "development"

    if email and trusted:
        user = (
            await session.execute(
                select(User).where(User.tenant_id == tenant_id, User.email == email)
            )
        ).scalar_one_or_none()
        if user is not None:
            user.firebase_uid = uid
            await session.flush()
            return user

    user = User(
        tenant_id=tenant_id,
        firebase_uid=uid,
        email=email or f"{uid}@unknown",
        display_name=claims.get("name") or "",
        role=Role.LEARNER,
    )
    session.add(user)
    await session.flush()
    return user


def require_role(*roles: Role):
    """Dependency: the caller must hold one of `roles`."""

    async def dependency(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Requires role: {', '.join(r.value for r in roles)}.",
            )
        return user

    return dependency


require_supervisor = require_role(Role.MANAGER, Role.ADMIN)
