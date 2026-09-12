from datetime import datetime, timezone
import enum
from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Text, Enum, Boolean
from sqlalchemy.orm import relationship

from src.core.database import Base
from src.models.base import TimestampMixin


class TransactionStatus(str, enum.Enum):
    PENDING_CONFIRMATION = "PENDING_CONFIRMATION"
    CONFIRMED = "CONFIRMED"
    MANUAL = "MANUAL"


class Transaction(Base, TimestampMixin):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(10), default="INR", nullable=False)
    timestamp = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="SET NULL"), nullable=True)
    merchant_raw_name = Column(String(255), nullable=True)

    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)

    upi_reference_id = Column(String(100), nullable=True, index=True)  # UTR / UPI Ref ID
    upi_vpa = Column(String(255), nullable=True)
    payment_app = Column(String(50), nullable=True)  # Google Pay, PhonePe, Paytm, BHIM, etc.

    status = Column(
        Enum(TransactionStatus, native_enum=False, length=50),
        default=TransactionStatus.CONFIRMED,
        nullable=False,
        index=True,
    )

    notes = Column(String(500), nullable=True)
    raw_extracted_text = Column(Text, nullable=True)
    receipt_image_path = Column(String(500), nullable=True)

    direction = Column(String(20), default="SENT", nullable=False)
    is_reimbursement = Column(Boolean, default=False, nullable=False)
    friend_id = Column(Integer, ForeignKey("friends.id", ondelete="SET NULL"), nullable=True)
    amount_paid_for_someone_else = Column(Numeric(10, 2), nullable=True)

    # Relationships
    user = relationship("User", back_populates="transactions")
    merchant = relationship("Merchant", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")
    friend = relationship("Friend")

    @property
    def has_receipt(self) -> bool:
        return bool(self.receipt_image_path)

