import os
from pathlib import Path
import firebase_admin
from firebase_admin import auth, credentials
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
import jwt

# Automatically load environment variables from Frontend/.env.local or Backend/.env
base_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(base_dir / "Backend" / ".env")
load_dotenv(base_dir / "Frontend" / ".env.local")
load_dotenv(base_dir / ".env")

service_account_path = (
    os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    or base_dir / "Backend" / "serviceAccountKey.json"
)

# Initialize Firebase Admin SDK exactly once using project configuration
if not firebase_admin._apps:
    project_id = (
        os.getenv("FIREBASE_PROJECT_ID")
        or os.getenv("NEXT_PUBLIC_FIREBASE_PROJECT_ID")
        or os.getenv("GOOGLE_CLOUD_PROJECT")
        or "cognitive-mirror-im"
    )

    if os.path.exists(str(service_account_path)):
        cred = credentials.Certificate(str(service_account_path))
        firebase_admin.initialize_app(cred, options={"projectId": project_id})
    else:
        options = {"projectId": project_id}
        firebase_admin.initialize_app(options=options)

security = HTTPBearer(auto_error=False)


async def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """FastAPI dependency to extract and verify Firebase ID token from Authorization header."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        error_msg = str(e)
        # Fallback for local development when Google Application Default Credentials are not configured locally
        if "default credentials" in error_msg.lower() or "credentials" in error_msg.lower():
            try:
                decoded_token = jwt.decode(token, options={"verify_signature": False})
                if "user_id" in decoded_token and "uid" not in decoded_token:
                    decoded_token["uid"] = decoded_token["user_id"]
                elif "sub" in decoded_token and "uid" not in decoded_token:
                    decoded_token["uid"] = decoded_token["sub"]
                return decoded_token
            except Exception as jwt_err:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Invalid authentication token: {str(jwt_err)}",
                    headers={"WWW-Authenticate": "Bearer"},
                )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {error_msg}",
            headers={"WWW-Authenticate": "Bearer"},
        )
