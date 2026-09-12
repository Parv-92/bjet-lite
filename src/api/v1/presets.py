from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.api.deps import get_db, get_current_user
from src.core.exceptions import NotFoundError, ValidationError
from src.models.user import User
from src.schemas.budget import BudgetSummary
from src.schemas.preset import (
    BudgetPresetCreate,
    BudgetPresetUpdate,
    BudgetPresetResponse,
    BudgetPresetApplyRequest,
)
from src.services.preset_service import preset_service

router = APIRouter(prefix="/budget-presets", tags=["Budget Presets"])


@router.get("", response_model=List[BudgetPresetResponse])
def list_budget_presets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all reusable budget templates configured by the current user."""
    return preset_service.list_presets(db, current_user.id)


@router.post("", response_model=BudgetPresetResponse, status_code=status.HTTP_201_CREATED)
def create_budget_preset(
    preset_in: BudgetPresetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new reusable budget preset with category-wise limits."""
    try:
        return preset_service.create_preset(db, current_user.id, preset_in)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{preset_id}", response_model=BudgetPresetResponse)
def get_budget_preset(
    preset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve details of a budget preset."""
    try:
        return preset_service.get_preset(db, current_user.id, preset_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.put("/{preset_id}", response_model=BudgetPresetResponse)
def update_budget_preset(
    preset_id: int,
    update_in: BudgetPresetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a budget preset's name and/or category limits."""
    try:
        return preset_service.update_preset(db, current_user.id, preset_id, update_in)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget_preset(
    preset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a budget preset."""
    try:
        preset_service.delete_preset(db, current_user.id, preset_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/{preset_id}/apply", response_model=List[BudgetSummary])
def apply_budget_preset(
    preset_id: int,
    apply_in: BudgetPresetApplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply a budget preset to a target month and year.
    
    Copies category limits into the target monthly budget.
    The monthly budget remains completely independent from the preset.
    """
    try:
        return preset_service.apply_preset(
            db, current_user.id, preset_id, apply_in.month, apply_in.year
        )
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
