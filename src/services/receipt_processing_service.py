import io
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from PIL import Image
from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.exceptions import (
    NotFoundError,
    ValidationError,
    TransactionNotFoundError,
    ReceiptNotFoundError,
    TransactionAlreadyConfirmedError,
)
from src.models.transaction import Transaction, TransactionStatus
from src.repositories.category_repo import category_repo
from src.repositories.merchant_repo import merchant_repo
from src.repositories.transaction_repo import transaction_repo
from src.repositories.budget_repo import calculate_category_net_spending
from src.schemas.receipt import (
    DuplicateInfo,
    ExtractionMetadata,
    ReceiptConfirmRequest,
    ReceiptScanResponse,
)
from src.schemas.transaction import TransactionResponse
from src.services.categorization_service import categorization_service
from src.services.duplicate_detection_service import duplicate_detection_service
from src.services.merchant_resolution_service import merchant_resolution_service
from src.services.ocr.base import OCRProvider, OCRResult
from src.services.ocr.easyocr_provider import EasyOCRProvider
from src.services.ocr.preprocessor import ImagePreprocessor
from src.services.parsing.extraction_service import extraction_service


class ReceiptProcessingService:
    """Orchestrates the receipt OCR scanning and confirmation lifecycle."""

    def __init__(self, ocr_provider: Optional[OCRProvider] = None):
        # Allow dependency injection of OCR provider (e.g. MockOCRProvider in tests)
        self.ocr_provider: OCRProvider = ocr_provider or EasyOCRProvider()

    def set_ocr_provider(self, provider: OCRProvider) -> None:
        """Dynamically swap the OCR provider (e.g., during tests)."""
        self.ocr_provider = provider

    def scan_receipt(
        self,
        db: Session,
        user_id: int,
        file_bytes: bytes,
        filename: Optional[str] = None,
        content_type: Optional[str] = None,
    ) -> ReceiptScanResponse:
        """Process an uploaded receipt image end-to-end and create a draft transaction."""
        # 1. Enforce max file size
        if len(file_bytes) > settings.MAX_UPLOAD_SIZE_BYTES:
            raise ValidationError(
                f"File size exceeds maximum allowed limit of {settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB."
            )

        # 2. Content-Type header validation
        if content_type and content_type not in settings.ALLOWED_IMAGE_MIME_TYPES:
            raise ValidationError(
                f"Unsupported file type '{content_type}'. Allowed types: {', '.join(settings.ALLOWED_IMAGE_MIME_TYPES)}."
            )

        # 3. Deep MIME and integrity validation using Pillow
        try:
            pil_image = Image.open(io.BytesIO(file_bytes))
            pil_image.verify()  # verify image integrity
            # Reopen after verify
            pil_image = Image.open(io.BytesIO(file_bytes))
            detected_format = (pil_image.format or "").lower()
            if detected_format not in ["jpeg", "png", "webp"]:
                raise ValidationError(f"Unsupported image format '{detected_format}'. Allowed: JPEG, PNG, WebP.")
        except Exception as e:
            if isinstance(e, ValidationError):
                raise e
            raise ValidationError("Uploaded file is corrupted or not a valid image.")

        # 4. Non-destructive disk persistence
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        unique_ext = ".png" if detected_format == "png" else (".webp" if detected_format == "webp" else ".jpg")
        unique_filename = f"{uuid.uuid4()}{unique_ext}"
        saved_image_path = os.path.join(settings.UPLOAD_DIR, unique_filename)

        with open(saved_image_path, "wb") as f:
            f.write(file_bytes)

        try:
            # 5. Non-destructive in-memory preprocessing for optimal OCR
            processed_bytes = ImagePreprocessor.preprocess_image_bytes(file_bytes)

            # 6. Extract text via OCR abstraction with crash resilience
            try:
                ocr_result = self.ocr_provider.extract_text(processed_bytes)
            except Exception:
                ocr_result = OCRResult(text="", lines=[], mean_confidence=0.0, raw_boxes=[])


            # 6. Parse structured UPI fields
            extracted = extraction_service.extract(ocr_result.text)

            # 7. Resolve merchant safely
            merchant_res = merchant_resolution_service.resolve(
                db=db,
                raw_name=extracted.merchant_raw_name,
                vpa=extracted.upi_vpa,
            )

            # 8. Intelligent Categorization Hierarchy:
            # Check UserMerchantRule -> Known Merchant default -> Fallback to Uncategorized
            cat_prediction = categorization_service.predict_category(
                db=db,
                user_id=user_id,
                merchant_name=extracted.merchant_raw_name,
                upi_vpa=extracted.upi_vpa,
                merchant_id=merchant_res.merchant_id,
            )

            # 9. Perform duplicate detection
            duplicate_res = duplicate_detection_service.detect_duplicate(
                db=db,
                user_id=user_id,
                upi_reference_id=extracted.upi_reference_id,
                amount=extracted.amount,
                merchant_raw_name=extracted.merchant_raw_name,
                timestamp=extracted.timestamp,
            )


            # 10. Create draft transaction strictly in PENDING_CONFIRMATION status
            effective_amount = extracted.amount if extracted.amount is not None else Decimal("0.00")
            effective_timestamp = extracted.timestamp or datetime.now(timezone.utc)

            db_draft = Transaction(
                user_id=user_id,
                amount=effective_amount,
                currency=extracted.currency,
                timestamp=effective_timestamp,
                merchant_id=merchant_res.merchant_id,
                merchant_raw_name=extracted.merchant_raw_name,
                category_id=cat_prediction.category_id,
                upi_reference_id=extracted.upi_reference_id,
                upi_vpa=extracted.upi_vpa,
                payment_app=extracted.payment_app,
                status=TransactionStatus.PENDING_CONFIRMATION,
                raw_extracted_text=ocr_result.text,
                receipt_image_path=saved_image_path,
            )
            db.add(db_draft)
            db.commit()
            db.refresh(db_draft)

        except Exception:
            # Database or pipeline failure: clean up saved image file so orphaned files don't accumulate
            if os.path.exists(saved_image_path):
                try:
                    os.remove(saved_image_path)
                except OSError:
                    pass
            db.rollback()
            raise

        # 11. Format response with extraction metadata and duplicate flags
        warnings = list(extracted.warnings)
        if duplicate_res.is_duplicate:
            warnings.append("potential_duplicate")
        if not merchant_res.is_resolved and extracted.merchant_raw_name:
            warnings.append("unverified_merchant")
        if not ocr_result.text.strip():
            warnings.append("ocr_text_empty")

        return ReceiptScanResponse(
            transaction=TransactionResponse.model_validate(db_draft),
            extraction=ExtractionMetadata(
                raw_text=ocr_result.text,
                detected_app=extracted.payment_app,
                confidence_score=extracted.confidence,
                warnings=warnings,
            ),
            duplicate=DuplicateInfo(
                is_duplicate=duplicate_res.is_duplicate,
                existing_transaction_id=duplicate_res.existing_transaction_id,
                reason=duplicate_res.reason,
            ),
        )

    def confirm_transaction(
        self,
        db: Session,
        user_id: int,
        transaction_id: int,
        confirm_in: ReceiptConfirmRequest,
    ) -> Transaction:
        """Validate user-reviewed values and transition transaction from PENDING_CONFIRMATION to CONFIRMED."""
        transaction = transaction_repo.get_by_id_for_user(db, user_id, transaction_id)
        if not transaction:
            raise TransactionNotFoundError(f"Transaction #{transaction_id} not found.")

        # Confirmation must only work for transactions in PENDING_CONFIRMATION status
        if transaction.status == TransactionStatus.CONFIRMED:
            raise TransactionAlreadyConfirmedError(
                f"Transaction #{transaction_id} is already confirmed and cannot be confirmed again."
            )
        if transaction.status != TransactionStatus.PENDING_CONFIRMATION:
            raise ValidationError(
                f"Transaction #{transaction_id} cannot be confirmed from status '{transaction.status.value}'."
            )

        # Validate category exists and is accessible to this user
        category = category_repo.get_by_id_for_user(db, confirm_in.category_id, user_id)
        if not category:
            raise NotFoundError(f"Category with ID {confirm_in.category_id} not found or not accessible.")

        # Validate amount
        if confirm_in.amount <= Decimal("0.00"):
            raise ValidationError("Transaction amount must be greater than zero.")

        # Update confirmed fields
        transaction.amount = confirm_in.amount
        transaction.category_id = confirm_in.category_id
        transaction.timestamp = confirm_in.timestamp

        if confirm_in.notes is not None:
            transaction.notes = confirm_in.notes

        # Handle merchant resolution on user confirmation
        # Never overwrite global merchant category defaults
        if confirm_in.merchant_name and confirm_in.merchant_name.strip():
            clean_name = " ".join(confirm_in.merchant_name.strip().split())
            transaction.merchant_raw_name = clean_name
            merchant = merchant_repo.get_or_create(
                db=db,
                name=clean_name,
                clean_name=clean_name.upper(),
                upi_vpa=transaction.upi_vpa,
                default_category_id=None,
            )
            transaction.merchant_id = merchant.id

        # Handle reimbursement vs normal expense
        if confirm_in.is_reimbursement:
            m, y = confirm_in.timestamp.month, confirm_in.timestamp.year
            available = calculate_category_net_spending(
                db, user_id, confirm_in.category_id, m, y, excluding_transaction_ids=[transaction.id]
            )
            if confirm_in.amount > available:
                raise ValidationError(
                    "Cannot apply this payment as a reimbursement because the selected category does not have enough spending to offset this amount."
                )
            transaction.direction = "RECEIVED"
            transaction.is_reimbursement = True
        else:
            transaction.direction = "SENT"
            transaction.is_reimbursement = False

        # Transition status safely to CONFIRMED
        transaction.status = TransactionStatus.CONFIRMED

        db.add(transaction)
        db.commit()
        db.refresh(transaction)
        return transaction

    def get_receipt_image(self, db: Session, user_id: int, transaction_id: int) -> tuple[str, str]:
        """Securely stream a stored receipt image for an authenticated owner."""
        transaction = transaction_repo.get_by_id_for_user(db, user_id, transaction_id)
        if not transaction:
            raise TransactionNotFoundError(f"Transaction #{transaction_id} not found.")

        if not transaction.receipt_image_path:
            raise ReceiptNotFoundError("Receipt image not found for this transaction.")

        real_upload_dir = os.path.realpath(settings.UPLOAD_DIR)
        real_file_path = os.path.realpath(transaction.receipt_image_path)

        # Path traversal guard: ensure resolved path remains strictly within configured UPLOAD_DIR
        try:
            common = os.path.commonpath([real_upload_dir, real_file_path])
        except ValueError:
            raise ReceiptNotFoundError("Receipt image file not found on storage.")

        if common != real_upload_dir or not os.path.isfile(real_file_path):
            raise ReceiptNotFoundError("Receipt image file not found on storage.")

        ext = os.path.splitext(real_file_path)[1].lower()
        mime_types = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
        }
        media_type = mime_types.get(ext, "application/octet-stream")
        return real_file_path, media_type


receipt_processing_service = ReceiptProcessingService()
