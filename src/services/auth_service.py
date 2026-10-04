from typing import Optional
from sqlalchemy.orm import Session

from src.core.security import get_password_hash, verify_password, create_access_token
from src.models.user import User
from src.repositories.user_repo import user_repo
from src.repositories.category_repo import category_repo
from src.schemas.user import UserCreate, normalize_email
from src.schemas.token import Token


class AuthService:
    def register(self, db: Session, user_in: UserCreate) -> User:
        clean_email = normalize_email(user_in.email)
        existing = user_repo.get_by_email(db, clean_email)
        if existing:
            raise ValueError("Email is already registered")

        # Initialize default categories if needed
        category_repo.init_default_categories(db)

        hashed_password = get_password_hash(user_in.password)
        return user_repo.create_user(db, user_in, hashed_password)

    def authenticate(self, db: Session, email: str, password: str) -> Optional[User]:
        clean_email = normalize_email(email)
        user = user_repo.get_by_email(db, clean_email)
        if not user or not user.is_active:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    def create_token(self, user: User) -> Token:
        access_token = create_access_token(subject=user.id)
        return Token(access_token=access_token, token_type="bearer")


auth_service = AuthService()
