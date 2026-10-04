from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict, field_validator


def normalize_email(email: str) -> str:
    """Canonical email normalization: strip whitespace and convert to lowercase."""
    return email.strip().lower() if email else ""


class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

    @field_validator("email", mode="before")
    @classmethod
    def validate_and_normalize_email(cls, v: str) -> str:
        if isinstance(v, str):
            return normalize_email(v)
        return v


class UserCreate(UserBase):
    password: str


class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
