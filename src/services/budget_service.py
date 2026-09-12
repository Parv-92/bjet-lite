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

        return budget_repo.create_or_update(db, user_id, budget_in)

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


