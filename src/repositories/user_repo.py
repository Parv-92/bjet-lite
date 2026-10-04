from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.models.user import User
from src.repositories.base import BaseRepository
from src.schemas.user import UserCreate, normalize_email


class UserRepository(BaseRepository[User]):
    def __init__(self):
        super().__init__(User)

    def get_by_email(self, db: Session, email: str) -> Optional[User]:
        clean_email = normalize_email(email)
        return db.query(User).filter(func.lower(User.email) == clean_email).first()

    def create_user(self, db: Session, user_in: UserCreate, hashed_password: str) -> User:
        clean_email = normalize_email(user_in.email)
        db_user = User(
            email=clean_email,
            hashed_password=hashed_password,
            full_name=user_in.full_name,
            is_active=True,
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user


user_repo = UserRepository()
