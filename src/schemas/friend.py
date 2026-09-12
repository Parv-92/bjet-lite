from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

from src.schemas.category import CategoryResponse


class FriendBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    recognized_name: str = Field(..., min_length=1, max_length=255)
    category_id: int


class FriendCreate(FriendBase):
    pass


class FriendUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    recognized_name: Optional[str] = Field(None, min_length=1, max_length=255)
    category_id: Optional[int] = None


class FriendResponse(FriendBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    category: Optional[CategoryResponse] = None

    model_config = ConfigDict(from_attributes=True)
