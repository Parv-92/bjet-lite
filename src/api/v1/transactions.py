from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.responses import FileResponse

from src.api.deps import get_db, get_current_user
from src.core.exceptions import NotFoundError, ValidationError
from src.models.user import User
from src.models.transaction import TransactionStatus
from src.schemas.receipt import ReceiptConfirmRequest, ReceiptScanResponse
from src.schemas.transaction import (
    TransactionCreate,
    TransactionUpdate,
    TransactionDetailResponse,
    TransactionListItemResponse,
    TransactionBulkDeleteRequest,
    TransactionBulkDeleteResponse,
)
from src.services.receipt_processing_service import receipt_processing_service
from src.services.transaction_service import transaction_service

router = APIRouter(prefix="/transactions", tags=["Transactions"])


# 1. Specific/Static receipt scan route
@router.post(
    "/scan-receipt",
    response_model=ReceiptScanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Scan UPI receipt screenshot and create draft transaction",
)
async def scan_receipt(
    file: UploadFile = File(..., description="UPI receipt screenshot image (JPEG, PNG, WebP)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a UPI receipt screenshot.

    Executes OCR and parsing pipeline, non-destructively preserves original image,
    and returns a draft transaction with status PENDING_CONFIRMATION, extraction metadata,
    and soft duplicate warnings.
    """
    file_bytes = await file.read()

    try:
        response = await run_in_threadpool(
            receipt_processing_service.scan_receipt,
            db=db,
            user_id=current_user.id,
            file_bytes=file_bytes,
            filename=file.filename,
            content_type=file.content_type,
        )
        return response
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# 2. List transactions (lightweight)
@router.get("", response_model=List[TransactionListItemResponse])
def list_transactions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    category_id: Optional[int] = None,
    status: Optional[TransactionStatus] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve lightweight transactions for the authenticated user with optional filtering."""
    return transaction_service.list_transactions(
        db=db,
        user_id=current_user.id,
        skip=skip,
        limit=limit,
        category_id=category_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
    )


# 3. Create transaction manually
@router.post("", response_model=TransactionDetailResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(
    transaction_in: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a transaction manually."""
    try:
        return transaction_service.create_transaction(
            db=db,
            user_id=current_user.id,
            transaction_in=transaction_in,
            status=TransactionStatus.CONFIRMED,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# 4. Stream receipt image (specific subpath before generic transaction_id)
@router.get(
    "/{transaction_id}/receipt",
    summary="Retrieve receipt image for transaction",
)
def get_transaction_receipt(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Securely stream the stored receipt image for the authenticated owner."""
    try:
        file_path, media_type = receipt_processing_service.get_receipt_image(
            db=db, user_id=current_user.id, transaction_id=transaction_id
        )
        return FileResponse(file_path, media_type=media_type)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# 5. Confirm draft transaction (specific subpath before generic transaction_id)
@router.post(
    "/{transaction_id}/confirm",
    response_model=TransactionDetailResponse,
    summary="Confirm a pending draft transaction",
)
def confirm_transaction(
    transaction_id: int,
    confirm_in: ReceiptConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Validate user-reviewed transaction fields and transition draft from PENDING_CONFIRMATION to CONFIRMED."""
    try:
        return receipt_processing_service.confirm_transaction(
            db=db,
            user_id=current_user.id,
            transaction_id=transaction_id,
            confirm_in=confirm_in,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# 6. Generic Get transaction by ID
@router.get("/{transaction_id}", response_model=TransactionDetailResponse)
def get_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get details of a specific transaction."""
    tx = transaction_service.get_transaction(db, current_user.id, transaction_id)
    if not tx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found",
        )
    return tx


# 7. Generic Update transaction by ID
@router.put("/{transaction_id}", response_model=TransactionDetailResponse)
def update_transaction(
    transaction_id: int,
    update_in: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update transaction fields such as category, notes, or status."""
    try:
        return transaction_service.update_transaction(
            db=db,
            user_id=current_user.id,
            transaction_id=transaction_id,
            update_in=update_in,
        )
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# 8. Bulk Delete transactions
@router.delete("/bulk", response_model=TransactionBulkDeleteResponse)
def bulk_delete_transactions(
    bulk_in: TransactionBulkDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Atomically delete multiple transactions for the authenticated user."""
    try:
        deleted_count = transaction_service.bulk_delete_transactions(
            db=db,
            user_id=current_user.id,
            transaction_ids=bulk_in.transaction_ids,
        )
        return TransactionBulkDeleteResponse(
            deleted_count=deleted_count,
            transaction_ids=bulk_in.transaction_ids,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# 9. Generic Delete transaction by ID
@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a transaction."""
    try:
        transaction_service.delete_transaction(db, current_user.id, transaction_id)
        return None
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
