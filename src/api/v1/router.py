from fastapi import APIRouter

from src.api.v1.auth import router as auth_router
from src.api.v1.categories import router as categories_router
from src.api.v1.transactions import router as transactions_router
from src.api.v1.budgets import router as budgets_router
from src.api.v1.rules import router as rules_router
from src.api.v1.friends import router as friends_router
from src.api.v1.presets import router as presets_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(categories_router)
api_router.include_router(transactions_router)
api_router.include_router(budgets_router)
api_router.include_router(rules_router)
api_router.include_router(friends_router)
api_router.include_router(presets_router)

