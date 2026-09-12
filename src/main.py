from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.core.config import settings
from src.core.database import engine, Base, SessionLocal
from src.core.exceptions import (
    NotFoundError,
    PermissionDeniedError,
    DuplicateError,
    ValidationError,
)
from src.models import *  # Ensure all models are registered with Base metadata
from sqlalchemy import inspect, text

from src.repositories.category_repo import category_repo
from src.api.v1.router import api_router


def _ensure_sqlite_schema(db_engine):
    """Ensure newly introduced Phase 14 columns exist on SQLite transactions table."""
    try:
        inspector = inspect(db_engine)
        if "transactions" in inspector.get_table_names():
            existing_cols = {col["name"] for col in inspector.get_columns("transactions")}
            with db_engine.begin() as conn:
                if "direction" not in existing_cols:
                    conn.execute(text("ALTER TABLE transactions ADD COLUMN direction VARCHAR(20) DEFAULT 'SENT' NOT NULL"))
                if "is_reimbursement" not in existing_cols:
                    conn.execute(text("ALTER TABLE transactions ADD COLUMN is_reimbursement BOOLEAN DEFAULT 0 NOT NULL"))
                if "friend_id" not in existing_cols:
                    conn.execute(text("ALTER TABLE transactions ADD COLUMN friend_id INTEGER REFERENCES friends(id) ON DELETE SET NULL"))
                if "amount_paid_for_someone_else" not in existing_cols:
                    conn.execute(text("ALTER TABLE transactions ADD COLUMN amount_paid_for_someone_else NUMERIC(10, 2)"))
    except Exception as e:
        # If in-memory or database engine does not support or already migrated, continue safely
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure tables are created and default categories seeded
    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_schema(engine)
    db = SessionLocal()
    try:
        category_repo.init_default_categories(db)
    finally:
        db.close()
    yield
    # Shutdown logic if needed


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # Centralized domain exception handlers
    @app.exception_handler(NotFoundError)
    async def not_found_handler(request: Request, exc: NotFoundError):
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": str(exc)},
        )

    @app.exception_handler(PermissionDeniedError)
    async def permission_denied_handler(request: Request, exc: PermissionDeniedError):
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": str(exc)},
        )

    @app.exception_handler(DuplicateError)
    async def duplicate_handler(request: Request, exc: DuplicateError):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": str(exc)},
        )

    @app.exception_handler(ValidationError)
    async def validation_handler(request: Request, exc: ValidationError):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": str(exc)},
        )

    # Configure CORS
    if settings.BACKEND_CORS_ORIGINS:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # Mount API routers
    app.include_router(api_router, prefix=settings.API_V1_STR)

    @app.get("/health", tags=["Health"])
    def health_check():
        return {
            "status": "healthy",
            "project": settings.PROJECT_NAME,
            "version": settings.VERSION,
        }

    @app.get("/", tags=["Root"])
    def root():
        return {
            "message": "Welcome to Smart Budget API. Visit /docs for interactive documentation."
        }

    return app


app = create_app()
