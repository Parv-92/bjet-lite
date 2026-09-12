from typing import List, Optional
from sqlalchemy.orm import Session, joinedload, selectinload

from src.models.preset import BudgetPreset, BudgetPresetItem
from src.repositories.base import BaseRepository
from src.schemas.preset import BudgetPresetCreate, BudgetPresetUpdate


class PresetRepository(BaseRepository[BudgetPreset]):
    def __init__(self):
        super().__init__(BudgetPreset)

    def get_by_id_for_user(self, db: Session, user_id: int, preset_id: int) -> Optional[BudgetPreset]:
        return (
            db.query(BudgetPreset)
            .options(
                selectinload(BudgetPreset.items).joinedload(BudgetPresetItem.category)
            )
            .filter(BudgetPreset.id == preset_id, BudgetPreset.user_id == user_id)
            .first()
        )

    def list_for_user(self, db: Session, user_id: int) -> List[BudgetPreset]:
        return (
            db.query(BudgetPreset)
            .options(
                selectinload(BudgetPreset.items).joinedload(BudgetPresetItem.category)
            )
            .filter(BudgetPreset.user_id == user_id)
            .order_by(BudgetPreset.name.asc())
            .all()
        )

    def create_for_user(self, db: Session, user_id: int, preset_in: BudgetPresetCreate) -> BudgetPreset:
        preset = BudgetPreset(
            user_id=user_id,
            name=preset_in.name.strip(),
        )
        db.add(preset)
        db.flush()  # to get preset.id

        for item_in in preset_in.items:
            item = BudgetPresetItem(
                preset_id=preset.id,
                category_id=item_in.category_id,
                amount=item_in.amount,
            )
            db.add(item)

        db.commit()
        db.refresh(preset)
        return self.get_by_id_for_user(db, user_id, preset.id)

    def update_for_user(
        self, db: Session, user_id: int, preset: BudgetPreset, update_in: BudgetPresetUpdate
    ) -> BudgetPreset:
        if update_in.name is not None:
            preset.name = update_in.name.strip()

        if update_in.items is not None:
            # Replace items atomically
            db.query(BudgetPresetItem).filter(BudgetPresetItem.preset_id == preset.id).delete()
            for item_in in update_in.items:
                item = BudgetPresetItem(
                    preset_id=preset.id,
                    category_id=item_in.category_id,
                    amount=item_in.amount,
                )
                db.add(item)

        db.commit()
        db.refresh(preset)
        return self.get_by_id_for_user(db, user_id, preset.id)

    def delete_for_user(self, db: Session, user_id: int, preset_id: int) -> bool:
        preset = self.get_by_id_for_user(db, user_id, preset_id)
        if preset:
            db.delete(preset)
            db.commit()
            return True
        return False


preset_repo = PresetRepository()
