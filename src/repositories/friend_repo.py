import re
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload

from src.models.friend import Friend
from src.repositories.base import BaseRepository
from src.schemas.friend import FriendCreate, FriendUpdate


def normalize_friend_pattern(text: Optional[str]) -> str:
    """Normalize friend recognized pattern deterministically: collapse whitespace, strip, uppercase."""
    if not text:
        return ""
    return " ".join(text.strip().split()).upper()


class FriendRepository(BaseRepository[Friend]):
    def __init__(self):
        super().__init__(Friend)

    def get_by_id_for_user(self, db: Session, user_id: int, friend_id: int) -> Optional[Friend]:
        return (
            db.query(Friend)
            .options(joinedload(Friend.category))
            .filter(Friend.id == friend_id, Friend.user_id == user_id)
            .first()
        )

    def list_for_user(self, db: Session, user_id: int) -> List[Friend]:
        return (
            db.query(Friend)
            .options(joinedload(Friend.category))
            .filter(Friend.user_id == user_id)
            .order_by(Friend.name.asc())
            .all()
        )

    def find_by_recognized_name(
        self, db: Session, user_id: int, recognized_name: str
    ) -> Optional[Friend]:
        norm = normalize_friend_pattern(recognized_name)
        return (
            db.query(Friend)
            .filter(Friend.user_id == user_id, Friend.recognized_name == norm)
            .first()
        )

    def find_matching_friend(
        self, db: Session, user_id: int, sender_text: Optional[str]
    ) -> Optional[Friend]:
        """Find user friend whose recognized_name matches or is contained in sender_text."""
        if not sender_text:
            return None
        norm_sender = normalize_friend_pattern(sender_text)
        if not norm_sender:
            return None

        # Do not mistake bank settlement/credit lines for friend counterparty
        if norm_sender.startswith("PAID TO BANK") or "BANK OF INDIA" in norm_sender:
            return None

        # Clean common transaction prefixes if present (e.g. "Received from Utsav" -> "UTSAV")
        cleaned_sender = re.sub(r"^(?:RECEIVED\s+FROM|FROM)\s+", "", norm_sender).strip()
        if not cleaned_sender or len(cleaned_sender) < 2:
            return None

        friends = self.list_for_user(db, user_id)
        # 1. Exact match first (against cleaned_sender or norm_sender)
        for friend in friends:
            if friend.recognized_name == cleaned_sender or friend.recognized_name == norm_sender:
                return friend

        # 2. Substring match (friend recognized_name inside sender_text or vice-versa)
        for friend in friends:
            pat = friend.recognized_name
            if not pat or len(pat) < 2:
                continue
            if (
                pat in cleaned_sender
                or cleaned_sender in pat
                or pat in norm_sender
            ):
                return friend
        return None

    def create_for_user(
        self, db: Session, user_id: int, friend_in: FriendCreate
    ) -> Friend:
        norm_recognized = normalize_friend_pattern(friend_in.recognized_name)
        friend = Friend(
            user_id=user_id,
            name=friend_in.name.strip(),
            recognized_name=norm_recognized,
            category_id=friend_in.category_id,
        )
        db.add(friend)
        db.commit()
        db.refresh(friend)
        return friend

    def update_for_user(
        self, db: Session, user_id: int, friend: Friend, update_in: FriendUpdate
    ) -> Friend:
        if update_in.name is not None:
            friend.name = update_in.name.strip()
        if update_in.recognized_name is not None:
            friend.recognized_name = normalize_friend_pattern(update_in.recognized_name)
        if update_in.category_id is not None:
            friend.category_id = update_in.category_id

        db.add(friend)
        db.commit()
        db.refresh(friend)
        return friend

    def delete_for_user(self, db: Session, user_id: int, friend_id: int) -> bool:
        friend = self.get_by_id_for_user(db, user_id, friend_id)
        if friend:
            db.delete(friend)
            db.commit()
            return True
        return False


friend_repo = FriendRepository()
