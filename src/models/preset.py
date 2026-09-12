from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from src.core.database import Base
from src.models.base import TimestampMixin


class BudgetPreset(Base, TimestampMixin):
    __tablename__ = "budget_presets"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)

    # Relationships
    user = relationship("User")
    items = relationship(
        "BudgetPresetItem",
        back_populates="preset",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class BudgetPresetItem(Base, TimestampMixin):
    __tablename__ = "budget_preset_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    preset_id = Column(Integer, ForeignKey("budget_presets.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)

    __table_args__ = (
        UniqueConstraint("preset_id", "category_id", name="uq_preset_category"),
    )

    # Relationships
    preset = relationship("BudgetPreset", back_populates="items")
    category = relationship("Category")
