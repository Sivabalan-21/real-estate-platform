"""GET /companies?scope=all (Super Admin) and the unchanged default mode."""
import uuid

import pytest

from models import Company, User
from rbac import ROLE_SUPER_ADMIN, ROLE_COMPANY_ADMIN, ROLE_PROPERTY_MANAGER, ROLE_TENANT

# (name, slug, code, number of users) — mirrors the production data.
SEED = [
    ("AMR",              "amr",             "AMR-0001", 0),
    ("Acme Properties",  "acme",            "ACME-0002", 8),
    ("Company A",        "company-a-0909",  "COMP-0909", 0),
    ("Default Company",  "default-company", "DEFA-0003", 0),
    ("ROME",             "ROME-0560",       "ROME-0560", 1),
    ("com A",            "com-a",           "COMA-0004", 0),
    ("company B",        "company-b",       "COMP-0005", 0),
    ("new builders",     "new-builders",    "NEWB-0006", 1),
    ("rk flat",          "rk-flat",         "RKFL-0007", 0),
]


@pytest.fixture
def seeded(db_session):
    for name, slug, code, n in SEED:
        c = Company(id=str(uuid.uuid4()), name=name, slug=slug, company_code=code)
        db_session.add(c)
        db_session.flush()
        for i in range(n):
            db_session.add(User(
                id=str(uuid.uuid4()), username=f"{slug}-u{i}", email=f"{slug}-u{i}@x.com",
                role=ROLE_COMPANY_ADMIN if i == 0 and name == "Acme Properties" else ROLE_TENANT,
                company_id=c.id, status="active",
            ))
    sa = User(id=str(uuid.uuid4()), username="root", email="root@x.com",
              role=ROLE_SUPER_ADMIN, company_id=None, status="active")
    db_session.add(sa)
    db_session.commit()
    return sa


def test_scope_all_returns_every_company_with_counts(client_factory, seeded):
    res = client_factory(seeded).get("/companies?scope=all")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 9
    assert {c["name"]: c["user_count"] for c in data} == {n: k for n, _, _, k in SEED}
    assert set(data[0]) == {"id", "name", "company_code", "slug", "user_count"}
    # Super Admin (no company) is not counted anywhere.
    assert sum(c["user_count"] for c in data) == 10


@pytest.mark.parametrize("role", [ROLE_COMPANY_ADMIN, ROLE_PROPERTY_MANAGER, ROLE_TENANT])
def test_scope_all_forbidden_for_other_roles(client_factory, db_session, seeded, role):
    co = db_session.query(Company).filter_by(name="Acme Properties").first()
    u = User(id=str(uuid.uuid4()), username="other", email="o@x.com",
             role=role, company_id=co.id, status="active")
    db_session.add(u)
    db_session.commit()
    assert client_factory(u).get("/companies?scope=all").status_code == 403


def test_default_mode_unchanged_only_companies_with_active_admin(client_factory, seeded):
    res = client_factory(seeded).get("/companies")
    assert res.status_code == 200
    assert [c["name"] for c in res.json()] == ["Acme Properties"]
    assert "user_count" not in res.json()[0]
