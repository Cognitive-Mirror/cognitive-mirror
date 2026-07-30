from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException, Depends

from app.schemas.auth import LoginRequest
from app.auth import verify_token

app = FastAPI(
    title="Cognitive Mirror",
    description="AI-powered Capability Intelligence Platform",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "Hello Cognitive Mirror"}


@app.post("/login")
def login(data: LoginRequest):

    accounts = {
        "admin@cognitivemirror.ai": {
            "password": "Admin123!",
            "redirect": "/admin",
        },
        "manager@cognitivemirror.ai": {
            "password": "Manager123!",
            "redirect": "/manager",
        },
        "learner@cognitivemirror.ai": {
            "password": "Learner123!",
            "redirect": "/learner",
        },
    }

    email = data.email.lower().strip()

    if email in accounts:
        account = accounts[email]

        if account["password"] == data.password:
            return {
                "success": True,
                "message": "FastAPI validated the password.",
                "redirect": account["redirect"],
            }

    raise HTTPException(
        status_code=401,
        detail="Invalid username or password.",
    )


@app.get("/auth/me")
def get_me(decoded_token: dict = Depends(verify_token)):
    return {
        "uid": decoded_token.get("uid") or decoded_token.get("sub"),
        "email": decoded_token.get("email"),
        "name": decoded_token.get("name"),
        "picture": decoded_token.get("picture"),
        "claims": decoded_token,
    }

