from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from src.api.deps import get_db, get_current_user
from src.core.exceptions import NotFoundError, ValidationError
from src.models.user import User
from src.schemas.budget import (
    BudgetCreate,
    BudgetResponse,
    BudgetSummary,
    MonthlySpendingBreakdown,
)
from src.services.budget_service import budget_service

router = APIRouter(prefix="/budgets", tags=["Budgets"])


@router.post("", response_model=BudgetResponse)
def set_or_update_budget(
    budget_in: BudgetCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or update a category budget for a specific month and year.

    Returns 201 Created if a new budget record was created, or 200 OK if updated.
    """
    try:
        budget, is_created = budget_service.set_budget(db, current_user.id, budget_in)
        response.status_code = status.HTTP_201_CREATED if is_created else status.HTTP_200_OK
        return budget
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/summary", response_model=List[BudgetSummary])
def get_monthly_budget_summary(
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    year: int = Query(..., ge=2000, le=2100, description="Year (e.g. 2026)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all budget summaries for a given month/year including spent amount and warnings."""
    return budget_service.get_monthly_budgets(
        db=db,
        user_id=current_user.id,
        month=month,
        year=year,
    )


@router.get("/spending-breakdown", response_model=MonthlySpendingBreakdown)
def get_monthly_spending_breakdown(
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    year: int = Query(..., ge=2000, le=2100, description="Year (e.g. 2026)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve monthly spending breakdown by category for the pie chart.

    Includes all confirmed/manual transactions in the selected month/year,
    including uncategorized expenses, minus reimbursements and paid-for-others amounts.
    Only categories with positive net spending are returned.
    """
    return budget_service.get_monthly_spending_breakdown(
        db=db,
        user_id=current_user.id,
        month=month,
        year=year,
    )


@router.get("/{category_id}", response_model=BudgetSummary)
def get_category_budget_status(
    category_id: int,
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve budget status for a specific category and period."""
    summary = budget_service.get_category_budget_summary(
        db=db,
        user_id=current_user.id,
        category_id=category_id,
        month=month,
        year=year,
    )
    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found for this category and period",
        )
    return summary

