from typing import Optional
from pydantic import BaseModel, field_validator


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email_field(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip().lower()
        return v

