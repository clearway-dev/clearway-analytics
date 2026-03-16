import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import get_db
from app.api.deps import get_current_active_user, require_admin
from app.models import User

_DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://clearway:clearway_dev_password@localhost:5432/clearway",
)

_engine = create_engine(_DB_URL, pool_pre_ping=True)
_SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def _make_admin() -> User:
    """Return a minimal in-memory User that satisfies all auth dependency checks."""
    user = User()
    user.id = 999
    user.email = "ci-test@clearway.test"
    user.role = "admin"
    user.is_active = True
    return user


@pytest.fixture(scope="session")
def client():
    """
    Session-scoped TestClient with two overrides:
      - get_db        → connects to the test database (golden image)
      - auth deps     → bypassed; no JWT or seeded user required
    """
    def _db_override():
        db = _SessionFactory()
        try:
            yield db
        finally:
            db.close()

    admin = _make_admin()
    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_current_active_user] = lambda: admin
    app.dependency_overrides[require_admin] = lambda: admin

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture
def db():
    """
    Function-scoped raw DB session for inserting and cleaning up test data directly.
    Does not go through FastAPI dependency injection.
    """
    session = _SessionFactory()
    try:
        yield session
    finally:
        session.close()
