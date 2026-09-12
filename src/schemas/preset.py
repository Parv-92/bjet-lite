from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

from src.schemas.category import CategoryResponse


class BudgetPresetItemBase(BaseModel):
    category_id: int
    amount: Decimal = Field(..., gt=0, description="Preset limit amount")


class BudgetPresetItemCreate(BudgetPresetItemBase):
    pass


class BudgetPresetItemResponse(BudgetPresetItemBase):
    id: int
    preset_id: int
    created_at: datetime
    updated_at: datetime
    category: Optional[CategoryResponse] = None

    model_config = ConfigDict(from_attributes=True)


class BudgetPresetBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Preset name, e.g., 'College Month'")


class BudgetPresetCreate(BudgetPresetBase):
    items: List[BudgetPresetItemCreate] = Field(default_factory=list)


class BudgetPresetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    items: Optional[List[BudgetPresetItemCreate]] = None


class BudgetPresetResponse(BudgetPresetBase):
    id: int
    user_id: int
    items: List[BudgetPresetItemResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BudgetPresetApplyRequest(BaseModel):
    month: int = Field(..., ge=1, le=12, description="Target month (1-12)")
    year: int = Field(..., ge=2000, le=2100, description="Target year (e.g., 2026)")
