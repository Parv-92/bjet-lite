from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

from src.schemas.category import CategoryResponse


class BudgetBase(BaseModel):
    category_id: int
    month: int = Field(..., ge=1, le=12, description="Month of the year (1-12)")
    year: int = Field(..., ge=2000, le=2100, description="Year (e.g. 2026)")
    amount_limit: Decimal = Field(..., ge=0, description="Budget limit amount")


class BudgetCreate(BudgetBase):
    pass


class BudgetUpdate(BaseModel):
    amount_limit: Decimal = Field(..., ge=0)


class BudgetResponse(BudgetBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    category: Optional[CategoryResponse] = None

    model_config = ConfigDict(from_attributes=True)


class BudgetSummary(BudgetResponse):
    spent_amount: Decimal = Decimal("0.00")
    remaining_amount: Decimal = Decimal("0.00")
    percentage_used: float = 0.0
    is_over_budget: bool = False


class CategorySpendingItem(BaseModel):
    category_id: Optional[int] = None
    category_name: str
    category_color: str
    category_icon: Optional[str] = None
    spent_amount: Decimal = Decimal("0.00")
    percentage: float = 0.0


class MonthlySpendingBreakdown(BaseModel):
    month: int
    year: int
    total_spent: Decimal = Decimal("0.00")
    items: list[CategorySpendingItem] = []

