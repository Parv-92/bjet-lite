from typing import List, Optional
from sqlalchemy.orm import Session

from src.core.exceptions import NotFoundError, ValidationError
from src.models.preset import BudgetPreset
from src.repositories.preset_repo import preset_repo
from src.repositories.category_repo import category_repo
from src.repositories.budget_repo import budget_repo
from src.schemas.budget import BudgetCreate, BudgetSummary
from src.schemas.preset import BudgetPresetCreate, BudgetPresetUpdate


class PresetService:
    def list_presets(self, db: Session, user_id: int) -> List[BudgetPreset]:
        return preset_repo.list_for_user(db, user_id)

    def get_preset(self, db: Session, user_id: int, preset_id: int) -> Optional[BudgetPreset]:
        preset = preset_repo.get_by_id_for_user(db, user_id, preset_id)
        if not preset:
            raise NotFoundError(f"Budget Preset #{preset_id} not found.")
        return preset

    def _validate_items(self, db: Session, user_id: int, items) -> None:
        seen_categories = set()
        for item in items:
            if item.category_id in seen_categories:
                raise ValidationError(f"Duplicate category ID {item.category_id} in preset items.")
            seen_categories.add(item.category_id)

            cat = category_repo.get_by_id_for_user(db, item.category_id, user_id)
            if not cat:
                raise NotFoundError(f"Category #{item.category_id} not found or not accessible.")
            if item.amount <= 0:
                raise ValidationError("Preset item amount must be greater than 0.")

    def create_preset(
        self, db: Session, user_id: int, preset_in: BudgetPresetCreate
    ) -> BudgetPreset:
        self._validate_items(db, user_id, preset_in.items)
        return preset_repo.create_for_user(db, user_id, preset_in)

    def update_preset(
        self, db: Session, user_id: int, preset_id: int, update_in: BudgetPresetUpdate
    ) -> BudgetPreset:
        preset = self.get_preset(db, user_id, preset_id)
        if update_in.items is not None:
            self._validate_items(db, user_id, update_in.items)
        return preset_repo.update_for_user(db, user_id, preset, update_in)

    def delete_preset(self, db: Session, user_id: int, preset_id: int) -> bool:
        preset = self.get_preset(db, user_id, preset_id)
        return preset_repo.delete_for_user(db, user_id, preset.id)

    def apply_preset(
        self, db: Session, user_id: int, preset_id: int, month: int, year: int
    ) -> List[BudgetSummary]:
        """Copy preset category limits into the target month's budgets.
        
        The resulting monthly budgets are completely independent from the preset.
        """
        preset = self.get_preset(db, user_id, preset_id)
        if not preset.items:
            raise ValidationError("Cannot apply an empty budget preset.")

        try:
            for item in preset.items:
                budget_in = BudgetCreate(
                    category_id=item.category_id,
                    month=month,
                    year=year,
                    amount_limit=item.amount,
                )
                budget_repo.create_or_update(db, user_id, budget_in)

            # Return updated monthly summaries
            budgets = budget_repo.get_all_for_period(db, user_id, month, year)
            return [budget_repo.get_budget_summary(db, b) for b in budgets]
        except Exception:
            db.rollback()
            raise


preset_service = PresetService()
