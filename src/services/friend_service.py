from typing import List, Optional
from sqlalchemy.orm import Session

from src.core.exceptions import NotFoundError, ValidationError, DuplicateError
from src.models.friend import Friend
from src.repositories.friend_repo import friend_repo, normalize_friend_pattern
from src.repositories.category_repo import category_repo
from src.schemas.friend import FriendCreate, FriendUpdate


class FriendService:
    def list_friends(self, db: Session, user_id: int) -> List[Friend]:
        return friend_repo.list_for_user(db, user_id)

    def get_friend(self, db: Session, user_id: int, friend_id: int) -> Optional[Friend]:
        friend = friend_repo.get_by_id_for_user(db, user_id, friend_id)
        if not friend:
            raise NotFoundError(f"Friend #{friend_id} not found.")
        return friend

    def create_friend(self, db: Session, user_id: int, friend_in: FriendCreate) -> Friend:
        # Validate category
        category = category_repo.get_by_id_for_user(db, friend_in.category_id, user_id)
        if not category:
            raise NotFoundError(f"Category #{friend_in.category_id} not found or not accessible.")

        # Normalize and validate pattern
        norm = normalize_friend_pattern(friend_in.recognized_name)
        if not norm:
            raise ValidationError("Recognized name pattern cannot be empty.")

        # Check unique constraint per user
        existing = friend_repo.find_by_recognized_name(db, user_id, norm)
        if existing:
            raise DuplicateError(f"A friend with recognized pattern '{norm}' already exists for this user.")

        return friend_repo.create_for_user(db, user_id, friend_in)

    def update_friend(
        self, db: Session, user_id: int, friend_id: int, update_in: FriendUpdate
    ) -> Friend:
        friend = self.get_friend(db, user_id, friend_id)

        if update_in.category_id is not None:
            category = category_repo.get_by_id_for_user(db, update_in.category_id, user_id)
            if not category:
                raise NotFoundError(f"Category #{update_in.category_id} not found or not accessible.")

        if update_in.recognized_name is not None:
            norm = normalize_friend_pattern(update_in.recognized_name)
            if not norm:
                raise ValidationError("Recognized name pattern cannot be empty.")
            existing = friend_repo.find_by_recognized_name(db, user_id, norm)
            if existing and existing.id != friend_id:
                raise DuplicateError(f"A friend with recognized pattern '{norm}' already exists for this user.")

        return friend_repo.update_for_user(db, user_id, friend, update_in)

    def delete_friend(self, db: Session, user_id: int, friend_id: int) -> bool:
        friend = self.get_friend(db, user_id, friend_id)
        return friend_repo.delete_for_user(db, user_id, friend.id)


friend_service = FriendService()
