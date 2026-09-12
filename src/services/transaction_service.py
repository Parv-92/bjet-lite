from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from sqlalchemy.orm import Session

from src.core.exceptions import NotFoundError, TransactionNotFoundError, ValidationError
from src.models.transaction import Transaction, TransactionStatus
from src.models.rule import UserMerchantRule
from src.repositories.transaction_repo import transaction_repo
from src.repositories.category_repo import category_repo
from src.repositories.merchant_repo import merchant_repo
from src.repositories.rule_repo import rule_repo, normalize_pattern
from src.repositories.friend_repo import friend_repo
from src.repositories.budget_repo import calculate_category_net_spending
from src.schemas.transaction import TransactionCreate, TransactionUpdate
from src.services.categorization_service import categorization_service


class TransactionService:
    def list_transactions(
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
        return transaction_repo.get_all_for_user(
            db=db,
            user_id=user_id,
            skip=skip,
            limit=limit,
            category_id=category_id,
            status=status,
            start_date=start_date,
            end_date=end_date,
        )

    def get_transaction(self, db: Session, user_id: int, transaction_id: int) -> Optional[Transaction]:
        return transaction_repo.get_by_id_for_user(db, user_id=user_id, transaction_id=transaction_id)

    def create_transaction(
        self,
        db: Session,
        user_id: int,
        transaction_in: TransactionCreate,
        status: TransactionStatus = TransactionStatus.CONFIRMED,
        raw_text: Optional[str] = None,
        receipt_image_path: Optional[str] = None,
    ) -> Transaction:
        # Validate amount
        if transaction_in.amount <= Decimal("0.00"):
            raise ValidationError("Transaction amount must be greater than 0.")

        # Validate amount_paid_for_someone_else
        if transaction_in.amount_paid_for_someone_else is not None:
            if transaction_in.amount_paid_for_someone_else <= Decimal("0.00"):
                raise ValidationError("Amount paid for someone else must be greater than 0.")
            if transaction_in.amount_paid_for_someone_else > transaction_in.amount:
                raise ValidationError("Amount paid for someone else cannot exceed transaction amount.")

        direction = transaction_in.direction or "SENT"
        transaction_in.direction = direction

        # Automatic friend recognition vs manual reimbursement resolution:
        # If direction == "RECEIVED":
        #   If is_reimbursement is None -> evaluate Friends
        #   If is_reimbursement is not None -> respect user choice
        if direction == "RECEIVED":
            if transaction_in.is_reimbursement is None:
                sender_text = transaction_in.merchant_raw_name or transaction_in.notes
                friend = friend_repo.find_matching_friend(db, user_id, sender_text)
                if friend:
                    transaction_in.is_reimbursement = True
                    transaction_in.category_id = friend.category_id
                    transaction_in.friend_id = friend.id
                else:
                    transaction_in.is_reimbursement = False
                    transaction_in.friend_id = None
        else:
            # Outgoing SENT cannot be a reimbursement
            transaction_in.is_reimbursement = False
            transaction_in.friend_id = None

        # Validate category if provided
        if transaction_in.category_id is not None:
            category = category_repo.get_by_id_for_user(db, transaction_in.category_id, user_id)
            if not category:
                raise NotFoundError(f"Category with ID {transaction_in.category_id} not found or not accessible.")
        elif direction == "SENT":
            # Intelligent Categorization fallback for outgoing transactions
            cat_prediction = categorization_service.predict_category(
                db=db,
                user_id=user_id,
                merchant_name=transaction_in.merchant_raw_name,
                upi_vpa=transaction_in.upi_vpa,
                merchant_id=transaction_in.merchant_id,
            )
            transaction_in.category_id = cat_prediction.category_id
        elif direction == "RECEIVED" and transaction_in.is_reimbursement:
            raise ValidationError("Reimbursement must have an associated category.")

        # Auto-create or resolve merchant if merchant_raw_name is provided but merchant_id is not
        if not transaction_in.merchant_id and transaction_in.merchant_raw_name:
            merchant = merchant_repo.get_or_create(
                db=db,
                name=transaction_in.merchant_raw_name,
                upi_vpa=transaction_in.upi_vpa,
                default_category_id=None,
            )
            transaction_in.merchant_id = merchant.id

        # Authoritative Backend Negative Spending Validation for Reimbursements:
        if transaction_in.is_reimbursement and status in (TransactionStatus.CONFIRMED, TransactionStatus.MANUAL):
            tx_time = transaction_in.timestamp or datetime.now(timezone.utc)
            m, y = tx_time.month, tx_time.year
            available_spending = calculate_category_net_spending(
                db, user_id, transaction_in.category_id, m, y
            )
            if transaction_in.amount > available_spending:
                raise ValidationError(
                    "Cannot apply this payment as a reimbursement because the selected category does not have enough spending to offset this amount."
                )

        try:
            return transaction_repo.create_for_user(
                db=db,
                user_id=user_id,
                transaction_in=transaction_in,
                status=status,
                raw_text=raw_text,
                receipt_image_path=receipt_image_path,
            )
        except Exception:
            db.rollback()
            raise

    def update_transaction(
        self,
        db: Session,
        user_id: int,
        transaction_id: int,
        update_in: TransactionUpdate,
    ) -> Transaction:
        transaction = transaction_repo.get_by_id_for_user(db, user_id, transaction_id)
        if not transaction:
            raise TransactionNotFoundError(f"Transaction #{transaction_id} not found.")

        # Lifecycle protection: generic PUT update cannot transition to or from PENDING_CONFIRMATION
        if update_in.status is not None and update_in.status != transaction.status:
            if transaction.status == TransactionStatus.PENDING_CONFIRMATION:
                raise ValidationError(
                    f"Pending transactions cannot be confirmed or transitioned via PUT. "
                    f"Use POST /api/v1/transactions/{transaction_id}/confirm instead."
                )
            if update_in.status == TransactionStatus.PENDING_CONFIRMATION:
                raise ValidationError("Transactions cannot be transitioned into PENDING_CONFIRMATION.")

        if update_in.category_id is not None:
            category = category_repo.get_by_id_for_user(db, update_in.category_id, user_id)
            if not category:
                raise NotFoundError(f"Category with ID {update_in.category_id} not found or not accessible.")

        eff_amount = update_in.amount if update_in.amount is not None else transaction.amount
        if eff_amount <= Decimal("0.00"):
            raise ValidationError("Transaction amount must be greater than 0.")

        eff_paid_other = (
            update_in.amount_paid_for_someone_else
            if update_in.amount_paid_for_someone_else is not None
            else transaction.amount_paid_for_someone_else
        )
        if eff_paid_other is not None:
            if eff_paid_other <= Decimal("0.00"):
                raise ValidationError("Amount paid for someone else must be greater than 0.")
            if eff_paid_other > eff_amount:
                raise ValidationError("Amount paid for someone else cannot exceed transaction amount.")

        eff_direction = update_in.direction if update_in.direction is not None else transaction.direction
        eff_is_reimb = (
            update_in.is_reimbursement
            if update_in.is_reimbursement is not None
            else transaction.is_reimbursement
        )
        eff_category_id = update_in.category_id if update_in.category_id is not None else transaction.category_id
        eff_timestamp = update_in.timestamp if update_in.timestamp is not None else transaction.timestamp
        eff_status = update_in.status if update_in.status is not None else transaction.status

        # Financial consistency validation:
        # Case A: If it's a confirmed reimbursement, check available net spending in that category
        if eff_is_reimb and eff_direction == "RECEIVED" and eff_status in (TransactionStatus.CONFIRMED, TransactionStatus.MANUAL):
            if not eff_category_id:
                raise ValidationError("Reimbursement must have an associated category.")
            m, y = eff_timestamp.month, eff_timestamp.year
            available = calculate_category_net_spending(
                db, user_id, eff_category_id, m, y, excluding_transaction_ids=[transaction.id]
            )
            if eff_amount > available:
                raise ValidationError(
                    "Cannot apply this payment as a reimbursement because the selected category does not have enough spending to offset this amount."
                )

        # Case B: If it's an outgoing expense, ensure adjusting it doesn't cause net category spending to become negative
        if eff_direction == "SENT" and eff_status in (TransactionStatus.CONFIRMED, TransactionStatus.MANUAL):
            m, y = eff_timestamp.month, eff_timestamp.year
            # Check old category if category changed
            if transaction.category_id and transaction.category_id != eff_category_id:
                old_m, old_y = transaction.timestamp.month, transaction.timestamp.year
                old_net = calculate_category_net_spending(
                    db, user_id, transaction.category_id, old_m, old_y, excluding_transaction_ids=[transaction.id]
                )
                if old_net < Decimal("0.00"):
                    raise ValidationError("Cannot adjust transaction because existing reimbursements exceed the resulting category spending.")

            if eff_category_id:
                net_excluding = calculate_category_net_spending(
                    db, user_id, eff_category_id, m, y, excluding_transaction_ids=[transaction.id]
                )
                net_this = eff_amount - (eff_paid_other or Decimal("0.00"))
                if (net_excluding + net_this) < Decimal("0.00"):
                    raise ValidationError("Cannot adjust transaction because existing reimbursements exceed the resulting category spending.")

        try:
            # Atomic merchant default preference update via UserMerchantRule
            if update_in.set_as_merchant_default:
                if update_in.category_id is None:
                    raise ValidationError("Cannot set merchant default when no category is supplied.")

                target_category_id = update_in.category_id
                target_cat = category_repo.get_by_id_for_user(db, target_category_id, user_id)
                if not target_cat:
                    raise NotFoundError(f"Category with ID {target_category_id} not found or not accessible.")

                if target_cat.name == "Uncategorized" and getattr(target_cat, "is_system_default", False):
                    raise ValidationError("Cannot set 'Uncategorized' as a merchant default category.")

                merchant_name = None
                if update_in.merchant_raw_name and update_in.merchant_raw_name.strip():
                    merchant_name = update_in.merchant_raw_name.strip()
                elif transaction.merchant_raw_name and transaction.merchant_raw_name.strip():
                    merchant_name = transaction.merchant_raw_name.strip()
                elif transaction.merchant and transaction.merchant.clean_name:
                    merchant_name = transaction.merchant.clean_name
                elif transaction.merchant_id:
                    m_obj = merchant_repo.get_by_id(db, transaction.merchant_id)
                    if m_obj:
                        merchant_name = m_obj.clean_name or m_obj.name

                if not merchant_name:
                    raise ValidationError("Cannot set merchant default for a transaction without a merchant name.")

                norm_pattern = normalize_pattern(merchant_name)
                if not norm_pattern:
                    raise ValidationError("Cannot set merchant default with an empty merchant pattern.")

                existing_rule = rule_repo.find_duplicate(db, user_id, norm_pattern)
                if existing_rule:
                    existing_rule.category_id = target_category_id
                    db.add(existing_rule)
                else:
                    new_rule = UserMerchantRule(
                        user_id=user_id,
                        merchant_pattern=norm_pattern,
                        category_id=target_category_id,
                        priority=1,
                    )
                    db.add(new_rule)

            return transaction_repo.update_for_user(db, user_id, transaction, update_in)
        except Exception:
            db.rollback()
            raise

    def delete_transaction(self, db: Session, user_id: int, transaction_id: int) -> bool:
        self.bulk_delete_transactions(db, user_id, [transaction_id])
        return True

    def bulk_delete_transactions(
        self, db: Session, user_id: int, transaction_ids: List[int]
    ) -> int:
        if not transaction_ids:
            return 0

        # Verify all transactions exist and belong to user
        transactions = transaction_repo.get_by_ids_for_user(db, user_id, transaction_ids)
        found_ids = {t.id for t in transactions}
        missing_ids = set(transaction_ids) - found_ids
        if missing_ids:
            raise NotFoundError(f"Transaction(s) {sorted(list(missing_ids))} not found or not accessible.")

        # Financial consistency check for deletions:
        # Deleting outgoing expenses must not leave any category with negative net spending
        affected_periods = set()
        for t in transactions:
            if t.category_id and t.direction == "SENT" and t.status in (TransactionStatus.CONFIRMED, TransactionStatus.MANUAL):
                affected_periods.add((t.category_id, t.timestamp.month, t.timestamp.year))

        for cat_id, m, y in affected_periods:
            projected_net = calculate_category_net_spending(
                db, user_id, cat_id, m, y, excluding_transaction_ids=transaction_ids
            )
            if projected_net < Decimal("0.00"):
                raise ValidationError(
                    "Cannot delete transaction(s) because existing reimbursements exceed the resulting category spending."
                )

        try:
            return transaction_repo.bulk_delete_for_user(db, user_id, transaction_ids)
        except Exception:
            db.rollback()
            raise


transaction_service = TransactionService()
