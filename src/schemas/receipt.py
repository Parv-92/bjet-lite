from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field

from src.schemas.transaction import TransactionResponse


class ExtractionMetadata(BaseModel):
    """Metadata extracted during receipt OCR processing."""
    raw_text: str
    detected_app: str = "Generic UPI"
    confidence_score: float = Field(0.0, ge=0.0, le=1.0)
    warnings: List[str] = Field(default_factory=list)


class DuplicateInfo(BaseModel):
    """Soft duplicate detection analysis."""
    is_duplicate: bool = False
    existing_transaction_id: Optional[int] = None
    reason: Optional[str] = None


class ReceiptScanResponse(BaseModel):
    """API response model for POST /transactions/scan-receipt."""
    transaction: TransactionResponse
    extraction: ExtractionMetadata
    duplicate: DuplicateInfo


class ReceiptConfirmRequest(BaseModel):
    """User-reviewed confirmation payload for POST /transactions/{id}/confirm."""
    amount: Decimal = Field(..., gt=0, description="Confirmed transaction amount")
    category_id: int = Field(..., description="Selected budget category ID")
    timestamp: datetime = Field(..., description="Confirmed transaction date/time")
    merchant_name: Optional[str] = Field(None, description="Confirmed or edited merchant name")
    notes: Optional[str] = Field(None, max_length=500, description="Optional user notes")
    is_reimbursement: Optional[bool] = Field(False, description="Whether this payment reduces category spending")

