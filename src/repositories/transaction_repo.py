from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload, defer
from sqlalchemy import desc

from src.models.transaction import Transaction, TransactionStatus
from src.repositories.base import BaseRepository
from src.schemas.transaction import TransactionCreate, TransactionUpdate


class TransactionRepository(BaseRepository[Transaction]):
    def __init__(self):
        super().__init__(Transaction)

    def get_by_id_for_user(self, db: Session, user_id: int, transaction_id: int) -> Optional[Transaction]:
        return (
            db.query(Transaction)
            .options(
                joinedload(Transaction.category),
                joinedload(Transaction.merchant),
                joinedload(Transaction.friend),
            )
            .filter(Transaction.id == transaction_id, Transaction.user_id == user_id)
            .first()
        )

    def get_by_ids_for_user(self, db: Session, user_id: int, transaction_ids: List[int]) -> List[Transaction]:
        if not transaction_ids:
            return []
        return (
            db.query(Transaction)
            .options(
                joinedload(Transaction.category),
                joinedload(Transaction.merchant),
                joinedload(Transaction.friend),
            )
            .filter(Transaction.id.in_(transaction_ids), Transaction.user_id == user_id)
            .all()
        )

    def get_all_for_user(
        self,
        db: Session,
        user_id: int,
        skip: int = 0,
        limit: int = 100,
        category_id: Optional[int] = None,
        status: Optional[TransactionStatus] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> List[Transaction]:
        query = (
            db.query(Transaction)
            .options(
                joinedload(Transaction.category),
                joinedload(Transaction.merchant),
                joinedload(Transaction.friend),
                defer(Transaction.raw_extracted_text),
            )
            .filter(Transaction.user_id == user_id)
        )
        if category_id is not None:
            query = query.filter(Transaction.category_id == category_id)
        if status is not None:
            query = query.filter(Transaction.status == status)
        if start_date is not None:
            query = query.filter(Transaction.timestamp >= start_date)
        if end_date is not None:
            query = query.filter(Transaction.timestamp <= end_date)

        return query.order_by(desc(Transaction.timestamp)).offset(skip).limit(limit).all()

    def create_for_user(
        self,
        db: Session,
        user_id: int,
        transaction_in: TransactionCreate,
        status: TransactionStatus = TransactionStatus.CONFIRMED,
        raw_text: Optional[str] = None,
        receipt_image_path: Optional[str] = None,
    ) -> Transaction:
        timestamp = transaction_in.timestamp or datetime.now(timezone.utc)
        direction = transaction_in.direction or "SENT"
        is_reimbursement = bool(transaction_in.is_reimbursement)
        db_obj = Transaction(
            user_id=user_id,
            amount=transaction_in.amount,
            currency=transaction_in.currency,
            timestamp=timestamp,
            merchant_id=transaction_in.merchant_id,
            merchant_raw_name=transaction_in.merchant_raw_name,
            category_id=transaction_in.category_id,
            upi_reference_id=transaction_in.upi_reference_id,
            upi_vpa=transaction_in.upi_vpa,
            payment_app=transaction_in.payment_app,
            notes=transaction_in.notes,
            direction=direction,
            is_reimbursement=is_reimbursement,
            friend_id=transaction_in.friend_id,
            amount_paid_for_someone_else=transaction_in.amount_paid_for_someone_else,
            status=status,
            raw_extracted_text=raw_text,
            receipt_image_path=receipt_image_path,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update_for_user(
        self,
        db: Session,
        user_id: int,
        transaction_obj: Transaction,
        update_in: TransactionUpdate,
    ) -> Transaction:
        update_data = update_in.model_dump(exclude_unset=True)
        update_data.pop("set_as_merchant_default", None)
        for field, value in update_data.items():
            if hasattr(transaction_obj, field):
                setattr(transaction_obj, field, value)

        db.add(transaction_obj)
        db.commit()
        db.refresh(transaction_obj)
        return transaction_obj

    def delete_for_user(self, db: Session, user_id: int, transaction_id: int) -> bool:
        obj = (
            db.query(Transaction)
            .filter(Transaction.id == transaction_id, Transaction.user_id == user_id)
            .first()
        )
        if obj:
            db.delete(obj)
            db.commit()
            return True
        return False

    def bulk_delete_for_user(self, db: Session, user_id: int, transaction_ids: List[int]) -> int:
        if not transaction_ids:
            return 0
        objs = (
            db.query(Transaction)
            .filter(Transaction.id.in_(transaction_ids), Transaction.user_id == user_id)
            .all()
        )
        count = len(objs)
        for obj in objs:
            db.delete(obj)
        db.commit()
        return count

    def find_by_upi_reference_id(
        self, db: Session, user_id: int, upi_reference_id: str
    ) -> Optional[Transaction]:
        """Find an existing transaction with the same UPI UTR reference for this user."""
        return (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.upi_reference_id == upi_reference_id.strip(),
            )
            .first()
        )

    def find_potential_duplicate(
        self,
        db: Session,
        user_id: int,
        amount,
        merchant_raw_name: Optional[str],
        start_time: datetime,
        end_time: datetime,
    ) -> Optional[Transaction]:
        """Fallback check for matching amount within a time window for the same user."""
        query = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.amount == amount,
                Transaction.timestamp >= start_time,
                Transaction.timestamp <= end_time,
            )
        )
        if merchant_raw_name:
            query = query.filter(
                Transaction.merchant_raw_name.ilike(f"%{merchant_raw_name.strip()}%")
            )
        return query.first()


transaction_repo = TransactionRepository()

