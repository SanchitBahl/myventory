# routers/household.py
# GET  /api/household  — get the current user's household
# PATCH /api/household — rename the household

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Household, User
from schemas import HouseholdOut, HouseholdUpdate

router = APIRouter()


@router.get("/household", response_model=HouseholdOut)
def get_household(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(Household).filter(Household.id == current_user.household_id).first()


@router.patch("/household", response_model=HouseholdOut)
def update_household(
    body: HouseholdUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    household = db.query(Household).filter(Household.id == current_user.household_id).first()
    household.name = body.name
    return household
