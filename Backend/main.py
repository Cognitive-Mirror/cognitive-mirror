from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
class LoginRequest(BaseModel):
    email: str
    password: str


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
