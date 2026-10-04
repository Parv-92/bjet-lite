from typing import List
from sqlalchemy.orm import Session

from src.core.exceptions import (
    CategoryNotFoundError,
    CategoryDuplicateError,
    CategoryImmutableError,
    ValidationError,
)
from src.models.budget import Budget
from src.models.category import Category
from src.models.friend import Friend
from src.models.preset import BudgetPresetItem
from src.models.rule import UserMerchantRule
from src.models.transaction import Transaction
from src.repositories.category_repo import category_repo
from src.schemas.category import CategoryCreate, CategoryUpdate


class CategoryService:
    def list_categories(self, db: Session, user_id: int) -> List[Category]:
        """List all system defaults and user-specific custom categories."""
        return category_repo.get_all_for_user(db, user_id=user_id)

    def get_category(self, db: Session, user_id: int, category_id: int) -> Category:
        """Get category by ID if it is a system default or owned by the user."""
        category = category_repo.get_by_id_for_user(db, category_id=category_id, user_id=user_id)
        if not category:
            raise CategoryNotFoundError(f"Category with ID {category_id} not found.")
        return category

    def create_category(
        self, db: Session, user_id: int, category_in: CategoryCreate
    ) -> Category:
        """Create a custom category for the user after verifying name uniqueness."""
        existing = category_repo.get_by_name_for_user(db, name=category_in.name, user_id=user_id)
        if existing:
            raise CategoryDuplicateError(
                f"A category with the name '{category_in.name}' already exists."
            )

        return category_repo.create_for_user(db, user_id=user_id, category_in=category_in)

    def update_category(
        self,
        db: Session,
        user_id: int,
        category_id: int,
        update_in: CategoryUpdate,
    ) -> Category:
        """Update an existing custom category."""
        category = category_repo.get_by_id_for_user(db, category_id=category_id, user_id=user_id)
        if not category:
            raise CategoryNotFoundError(f"Category with ID {category_id} not found.")

        if category.is_system_default:
            raise CategoryImmutableError("System default categories cannot be modified.")

        if category.user_id != user_id:
            raise CategoryNotFoundError(f"Category with ID {category_id} not found.")

        if update_in.name and update_in.name.strip().lower() != category.name.lower():
            existing = category_repo.get_by_name_for_user(db, name=update_in.name, user_id=user_id)
            if existing and existing.id != category.id:
                raise CategoryDuplicateError(
                    f"A category with the name '{update_in.name}' already exists."
                )

        return category_repo.update_for_user(db, category=category, update_in=update_in)

    def delete_category(self, db: Session, user_id: int, category_id: int) -> None:
        """Delete an existing custom category after validating it is not referenced."""
        category = category_repo.get_by_id_for_user(db, category_id=category_id, user_id=user_id)
        if not category:
            raise CategoryNotFoundError(f"Category with ID {category_id} not found.")

        if category.is_system_default:
            raise CategoryImmutableError("System default categories cannot be deleted.")

        if category.user_id != user_id:
            raise CategoryNotFoundError(f"Category with ID {category_id} not found.")

        # Restrict deletion: check if category is referenced by transactions, presets, merchant rules, or friends
        has_transactions = (
            db.query(Transaction.id).filter(Transaction.category_id == category.id).first() is not None
        )
        has_presets = (
            db.query(BudgetPresetItem.id).filter(BudgetPresetItem.category_id == category.id).first() is not None
        )
        has_rules = (
            db.query(UserMerchantRule.id).filter(UserMerchantRule.category_id == category.id).first() is not None
        )
        has_friends = (
            db.query(Friend.id).filter(Friend.category_id == category.id).first() is not None
        )

        reasons = []
        if has_transactions:
            reasons.append("existing transactions")
        if has_presets:
            reasons.append("budget presets")
        if has_rules:
            reasons.append("merchant rules")
        if has_friends:
            reasons.append("friend reimbursement settings")

        if reasons:
            raise ValidationError(
                f"Category cannot be deleted because it is currently used by: {', '.join(reasons)}."
            )

        # Cascade-delete any monthly budget targets for this category
        db.query(Budget).filter(Budget.category_id == category.id).delete(synchronize_session=False)

        category_repo.delete(db, category=category)


category_service = CategoryService()
