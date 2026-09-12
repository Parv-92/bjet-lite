from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.api.deps import get_db, get_current_user
from src.core.exceptions import NotFoundError, ValidationError, DuplicateError
from src.models.user import User
from src.schemas.friend import FriendCreate, FriendUpdate, FriendResponse
from src.services.friend_service import friend_service

router = APIRouter(prefix="/friends", tags=["Friends"])


@router.get("", response_model=List[FriendResponse])
def list_friends(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all friends configured by the current user."""
    return friend_service.list_friends(db, current_user.id)


@router.post("", response_model=FriendResponse, status_code=status.HTTP_201_CREATED)
def create_friend(
    friend_in: FriendCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Configure a new friend for automatic incoming reimbursement recognition."""
    try:
        return friend_service.create_friend(db, current_user.id, friend_in)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except (ValidationError, DuplicateError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{friend_id}", response_model=FriendResponse)
def get_friend(
    friend_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve details of a configured friend."""
    try:
        return friend_service.get_friend(db, current_user.id, friend_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.put("/{friend_id}", response_model=FriendResponse)
def update_friend(
    friend_id: int,
    update_in: FriendUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a friend's details or default reimbursement category."""
    try:
        return friend_service.update_friend(db, current_user.id, friend_id, update_in)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except (ValidationError, DuplicateError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{friend_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_friend(
    friend_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a configured friend."""
    try:
        friend_service.delete_friend(db, current_user.id, friend_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
