"""
Test setup for the Unit / Lease API (Day 3 + Day 6 coverage).

Points the app at a throwaway SQLite file instead of the real Postgres
DB, so tests never touch real data. Import order matters: DATABASE_URL
must be set before `main` (and therefore `database`) is imported.
"""
import os
import sys
import uuid

os.environ["DATABASE_URL"] = "sqlite:///./test_units.db"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

import main
from database import Base, engine, SessionLocal
from models import Company, User
from rbac import ROLE_PROPERTY_MANAGER, ROLE_COMPANY_ADMIN, ROLE_ADMIN


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def company_a(db_session):
    c = Company(id=str(uuid.uuid4()), name="Company A")
    db_session.add(c)
    db_session.commit()
    return c


@pytest.fixture
def company_b(db_session):
    c = Company(id=str(uuid.uuid4()), name="Company B")
    db_session.add(c)
    db_session.commit()
    return c


@pytest.fixture
def pm_user(db_session, company_a):
    u = User(
        id=str(uuid.uuid4()),
        username="pm_a",
        email="pm_a@example.com",
        role=ROLE_PROPERTY_MANAGER,
        company_id=company_a.id,
        status="active",
    )
    db_session.add(u)
    db_session.commit()
    return u


@pytest.fixture
def admin_user(db_session, company_a):
    u = User(
        id=str(uuid.uuid4()),
        username="admin_a",
        email="admin_a@example.com",
        role=ROLE_COMPANY_ADMIN,
        company_id=company_a.id,
        status="active",
    )
    db_session.add(u)
    db_session.commit()
    return u


@pytest.fixture
def regional_admin_user(db_session, company_a):
    """Role literally named 'Admin' — per ROLE_HIERARCHY in rbac.py, this is
    the role that actually manages Property Manager accounts (Company Admin
    only manages 'Admin'-role users directly)."""
    u = User(
        id=str(uuid.uuid4()),
        username="regional_admin_a",
        email="regional_admin_a@example.com",
        role=ROLE_ADMIN,
        company_id=company_a.id,
        status="active",
    )
    db_session.add(u)
    db_session.commit()
    return u


@pytest.fixture
def client_factory(db_session):
    """client_factory(user) -> TestClient acting as that user."""
    def _get_db():
        yield db_session

    def _factory(user):
        main.app.dependency_overrides[main.get_db] = _get_db
        main.app.dependency_overrides[main.current_user] = lambda: user
        return TestClient(main.app)

    yield _factory
    main.app.dependency_overrides.clear()