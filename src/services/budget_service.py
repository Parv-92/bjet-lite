from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from sqlalchemy.orm import Session

from src.core.exceptions import NotFoundError
from src.models.budget import Budget
from src.repositories.budget_repo import budget_repo
from src.repositories.category_repo import category_repo
from src.schemas.budget import BudgetCreate, BudgetSummary, MonthlySpendingBreakdown


class BudgetService:
    def set_budget(
        self, db: Session, user_id: int, budget_in: BudgetCreate
    ) -> tuple[Budget, bool]:
        category = category_repo.get_by_id_for_user(db, budget_in.category_id, user_id)
        if not category:
            raise NotFoundError(f"Category with ID {budget_in.category_id} not found or not accessible.")

        if budget_in.amount_limit == Decimal("0"):
            # Setting to 0 removes the budget record for that period
            existing = budget_repo.get_by_category_and_period(
                db, user_id, budget_in.category_id, budget_in.month, budget_in.year
            )
            if existing:
                existing_id = existing.id
                created_at = existing.created_at
                budget_repo.delete(db, existing)
                placeholder = Budget(
                    id=existing_id,
                    user_id=user_id,
                    category_id=budget_in.category_id,
                    month=budget_in.month,
                    year=budget_in.year,
                    amount_limit=Decimal("0.00"),
                    created_at=created_at,
                    updated_at=datetime.now(timezone.utc),
                )
                placeholder.category = category
                return placeholder, False
            else:
                placeholder = Budget(
                    id=0,
                    user_id=user_id,
                    category_id=budget_in.category_id,
                    month=budget_in.month,
                    year=budget_in.year,
                    amount_limit=Decimal("0.00"),
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc),
                )
                placeholder.category = category
                return placeholder, False

        return budget_repo.create_or_update(db, user_id, budget_in)

    def delete_budget(
        self, db: Session, user_id: int, category_id: int, month: int, year: int
    ) -> bool:
        category = category_repo.get_by_id_for_user(db, category_id, user_id)
        if not category:
            raise NotFoundError(f"Category with ID {category_id} not found or not accessible.")

        deleted = budget_repo.delete_by_category_and_period(db, user_id, category_id, month, year)
        if not deleted:
            raise NotFoundError("Budget not found for this category and period.")
        return True

    def get_monthly_budgets(
        self, db: Session, user_id: int, month: int, year: int
    ) -> List[BudgetSummary]:
        budgets = budget_repo.get_all_for_period(db, user_id, month, year)
        return [budget_repo.get_budget_summary(db, b) for b in budgets]

    def get_category_budget_summary(
        self, db: Session, user_id: int, category_id: int, month: int, year: int
    ) -> Optional[BudgetSummary]:
        budget = budget_repo.get_by_category_and_period(db, user_id, category_id, month, year)
        if not budget:
            return None
        return budget_repo.get_budget_summary(db, budget)

    def get_monthly_spending_breakdown(
        self, db: Session, user_id: int, month: int, year: int
    ) -> MonthlySpendingBreakdown:
        return budget_repo.get_monthly_spending_breakdown(db, user_id, month, year)


budget_service = BudgetService()


