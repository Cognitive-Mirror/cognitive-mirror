"""Firebase authentication dependency for FastAPI.

Verifies Firebase ID tokens presented as `Authorization: Bearer <token>`.

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
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth, credentials

from app.config import get_settings

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
        # Falls back to Application Default Credentials.
        firebase_admin.initialize_app(options=options)
        logger.info(
            "Firebase Admin initialised without a service account file "
            "(using Application Default Credentials)."
        )


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
