"""Authentication schemas.

Extracts the inline LoginRequest from main.py into a proper schema module.
"""

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    """Credentials submitted by the frontend login form."""

    email: str = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class LoginResponse(BaseModel):
    """Successful login response returned to the frontend."""

    success: bool
    message: str
    redirect: str = Field(..., description="Role-based redirect path, e.g. /learner")
