from decimal import Decimal
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract

from src.models.budget import Budget
from src.models.transaction import Transaction, TransactionStatus
from src.repositories.base import BaseRepository
from src.schemas.budget import (
    BudgetCreate,
    BudgetUpdate,
    BudgetSummary,
    CategorySpendingItem,
    MonthlySpendingBreakdown,
)


def calculate_category_net_spending(
    db: Session,
    user_id: int,
    category_id: int,
    month: int,
    year: int,
    excluding_transaction_ids: Optional[List[int]] = None,
) -> Decimal:
    """Calculate authoritative Net Category Spending for a user, category, month, and year.

    Formula:
      Gross Outgoing Expenses = sum(SENT amount - coalesce(amount_paid_for_someone_else, 0))
      Category Reimbursements = sum(RECEIVED amount where is_reimbursement is True)
      Net Spending = Gross Outgoing Expenses - Category Reimbursements

    Only finalized confirmed and manual transactions participate:
      status in (CONFIRMED, MANUAL)
    Optionally excludes transactions by ID (for update and deletion validation).
    """
    from sqlalchemy import or_

    base_query = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.category_id == category_id,
        Transaction.status.in_([TransactionStatus.CONFIRMED, TransactionStatus.MANUAL]),
        extract("month", Transaction.timestamp) == month,
        extract("year", Transaction.timestamp) == year,
    )
    if excluding_transaction_ids:
        base_query = base_query.filter(~Transaction.id.in_(excluding_transaction_ids))

    outgoing_expr = func.sum(
        Transaction.amount - func.coalesce(Transaction.amount_paid_for_someone_else, 0)
    )
    outgoing_sum = (
        base_query.filter(
            or_(
                Transaction.direction == "SENT",
                Transaction.direction.is_(None),
            )
        )
        .with_entities(func.coalesce(outgoing_expr, 0))
        .scalar()
    )

    reimb_sum = (
        base_query.filter(
            Transaction.direction == "RECEIVED",
            Transaction.is_reimbursement.is_(True),
        )
        .with_entities(func.coalesce(func.sum(Transaction.amount), 0))
        .scalar()
    )

    return Decimal(str(outgoing_sum)) - Decimal(str(reimb_sum))


class BudgetRepository(BaseRepository[Budget]):
    def __init__(self):
        super().__init__(Budget)

    def get_by_category_and_period(
        self, db: Session, user_id: int, category_id: int, month: int, year: int
    ) -> Optional[Budget]:
        return (
            db.query(Budget)
            .options(joinedload(Budget.category))
            .filter(
                Budget.user_id == user_id,
                Budget.category_id == category_id,
                Budget.month == month,
                Budget.year == year,
            )
            .first()
        )

    def get_all_for_period(
        self, db: Session, user_id: int, month: int, year: int
    ) -> List[Budget]:
        return (
            db.query(Budget)
            .options(joinedload(Budget.category))
            .filter(
                Budget.user_id == user_id,
                Budget.month == month,
                Budget.year == year,
            )
            .all()
        )

    def get_by_id_for_user(
        self, db: Session, user_id: int, budget_id: int
    ) -> Optional[Budget]:
        return (
            db.query(Budget)
            .options(joinedload(Budget.category))
            .filter(Budget.id == budget_id, Budget.user_id == user_id)
            .first()
        )

    def create_or_update(
        self, db: Session, user_id: int, budget_in: BudgetCreate
    ) -> tuple[Budget, bool]:
        existing = self.get_by_category_and_period(
            db, user_id, budget_in.category_id, budget_in.month, budget_in.year
        )
        if existing:
            existing.amount_limit = budget_in.amount_limit
            db.add(existing)
            db.commit()
            db.refresh(existing)
            return existing, False

        budget = Budget(
            user_id=user_id,
            category_id=budget_in.category_id,
            month=budget_in.month,
            year=budget_in.year,
            amount_limit=budget_in.amount_limit,
        )
        db.add(budget)
        db.commit()
        db.refresh(budget)
        return budget, True

    def update(
        self, db: Session, budget: Budget, amount_limit: Decimal
    ) -> Budget:
        budget.amount_limit = amount_limit
        db.add(budget)
        db.commit()
        db.refresh(budget)
        return budget

    def get_spent_amount(
        self, db: Session, user_id: int, category_id: int, month: int, year: int
    ) -> Decimal:
        """Get net spent amount for this category, month, and year."""
        return calculate_category_net_spending(db, user_id, category_id, month, year)

    def get_budget_summary(
        self, db: Session, budget: Budget
    ) -> BudgetSummary:
        spent = self.get_spent_amount(
            db, budget.user_id, budget.category_id, budget.month, budget.year
        )
        remaining = budget.amount_limit - spent
        percentage = float((spent / budget.amount_limit) * 100) if budget.amount_limit > 0 else 0.0

        return BudgetSummary(
            id=budget.id,
            user_id=budget.user_id,
            category_id=budget.category_id,
            month=budget.month,
            year=budget.year,
            amount_limit=budget.amount_limit,
            created_at=budget.created_at,
            updated_at=budget.updated_at,
            category=budget.category,
            spent_amount=spent,
            remaining_amount=remaining,
            percentage_used=round(percentage, 2),
            is_over_budget=spent > budget.amount_limit,
        )

    def get_monthly_spending_breakdown(
        self, db: Session, user_id: int, month: int, year: int
    ) -> MonthlySpendingBreakdown:
        """Calculate authoritative monthly spending breakdown by category for a user.

        - Derived strictly from actual transactions in the selected month/year.
        - Includes only finalized transactions: status in (CONFIRMED, MANUAL).
        - Includes uncategorized outgoing expenses (net_uncategorized = outgoing - paid_for_others)
          attributed to 'Uncategorized' with color #9E9E9E.
        - Reimbursements reduce their respective category spending.
        - Includes categories only when their final net spending is positive (> 0).
        - Results sorted descending by spent_amount.
        """
        from collections import defaultdict
        from src.models.category import Category

        # 1. Query all confirmed/manual transactions for this user and period
        transactions = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.status.in_([TransactionStatus.CONFIRMED, TransactionStatus.MANUAL]),
                extract("month", Transaction.timestamp) == month,
                extract("year", Transaction.timestamp) == year,
            )
            .all()
        )

        outgoing_by_cat = defaultdict(Decimal)
        reimb_by_cat = defaultdict(Decimal)

        for tx in transactions:
            direction = tx.direction or "SENT"
            if direction == "RECEIVED" and tx.is_reimbursement:
                if tx.category_id is not None:
                    reimb_by_cat[tx.category_id] += Decimal(str(tx.amount))
            elif direction == "SENT":
                paid_for_others = Decimal(str(tx.amount_paid_for_someone_else or 0))
                net_tx = Decimal(str(tx.amount)) - paid_for_others
                outgoing_by_cat[tx.category_id] += net_tx

        # 2. Collect referenced category IDs
        all_cat_keys = set(outgoing_by_cat.keys()) | set(reimb_by_cat.keys())
        referenced_cat_ids = {cid for cid in all_cat_keys if cid is not None}

        categories_by_id = {}
        if referenced_cat_ids:
            cats = db.query(Category).filter(Category.id.in_(referenced_cat_ids)).all()
            for c in cats:
                categories_by_id[c.id] = c

        # 3. Calculate net spending per category
        uncat_spending = Decimal("0.00")
        cat_spending_map = {}

        for cid in all_cat_keys:
            net_spent = outgoing_by_cat[cid] - reimb_by_cat[cid]
            if net_spent <= 0:
                continue

            if cid is None:
                uncat_spending += net_spent
            else:
                cat_obj = categories_by_id.get(cid)
                if cat_obj and cat_obj.name.strip().lower() == "uncategorized":
                    uncat_spending += net_spent
                else:
                    cat_spending_map[cid] = net_spent

        items: List[CategorySpendingItem] = []

        for cid, spent in cat_spending_map.items():
            cat_obj = categories_by_id.get(cid)
            name = cat_obj.name if cat_obj else f"Category {cid}"
            color = cat_obj.color if (cat_obj and cat_obj.color) else "#3B82F6"
            icon = cat_obj.icon if cat_obj else None
            items.append(
                CategorySpendingItem(
                    category_id=cid,
                    category_name=name,
                    category_color=color,
                    category_icon=icon,
                    spent_amount=spent,
                    percentage=0.0,
                )
            )

        if uncat_spending > 0:
            items.append(
                CategorySpendingItem(
                    category_id=None,
                    category_name="Uncategorized",
                    category_color="#9E9E9E",
                    category_icon="help-circle",
                    spent_amount=uncat_spending,
                    percentage=0.0,
                )
            )

        # 4. Sort descending by spent_amount
        items.sort(key=lambda x: x.spent_amount, reverse=True)

        # 5. Compute total and percentages
        total_spent = sum((item.spent_amount for item in items), Decimal("0.00"))
        if total_spent > 0:
            for item in items:
                item.percentage = round(float((item.spent_amount / total_spent) * 100), 1)

        return MonthlySpendingBreakdown(
            month=month,
            year=year,
            total_spent=total_spent,
            items=items,
        )


budget_repo = BudgetRepository()
