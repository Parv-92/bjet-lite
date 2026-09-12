from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

from src.models.transaction import TransactionStatus
from src.schemas.category import CategoryResponse
from src.schemas.merchant import MerchantResponse
from src.schemas.friend import FriendResponse


class TransactionBase(BaseModel):
    amount: Decimal
    currency: str = "INR"
    timestamp: Optional[datetime] = None
    merchant_id: Optional[int] = None
    merchant_raw_name: Optional[str] = None
    category_id: Optional[int] = None
    upi_reference_id: Optional[str] = None
    upi_vpa: Optional[str] = None
    payment_app: Optional[str] = None
    notes: Optional[str] = None
    direction: str = "SENT"
    is_reimbursement: Optional[bool] = None  # None allows automatic friend evaluation on RECEIVED
    friend_id: Optional[int] = None
    amount_paid_for_someone_else: Optional[Decimal] = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    amount: Optional[Decimal] = None
    currency: Optional[str] = None
    timestamp: Optional[datetime] = None
    merchant_id: Optional[int] = None
    merchant_raw_name: Optional[str] = None
    category_id: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[TransactionStatus] = None
    set_as_merchant_default: Optional[bool] = False
    direction: Optional[str] = None
    is_reimbursement: Optional[bool] = None
    friend_id: Optional[int] = None
    amount_paid_for_someone_else: Optional[Decimal] = None


class TransactionBulkDeleteRequest(BaseModel):
    transaction_ids: List[int] = Field(..., min_length=1, description="List of transaction IDs to delete")


class TransactionBulkDeleteResponse(BaseModel):
    deleted_count: int
    transaction_ids: List[int]


class TransactionListItemResponse(TransactionBase):
    id: int
    user_id: int
    status: TransactionStatus
    has_receipt: bool = False
    is_reimbursement: bool = False
    direction: str = "SENT"
    created_at: datetime
    updated_at: datetime

    category: Optional[CategoryResponse] = None
    merchant: Optional[MerchantResponse] = None
    friend: Optional[FriendResponse] = None

    model_config = ConfigDict(from_attributes=True)


class TransactionDetailResponse(TransactionListItemResponse):
    raw_extracted_text: Optional[str] = None


# Alias for backwards compatibility across existing service layers
TransactionResponse = TransactionDetailResponse


