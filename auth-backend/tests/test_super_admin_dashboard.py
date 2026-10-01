"""GET /admin/dashboard and the search / filter / pagination mode of GET /users."""
import uuid

import pytest

from models import Company, User
from rbac import (
    ROLE_SUPER_ADMIN, ROLE_COMPANY_ADMIN, ROLE_ADMIN, ROLE_PROPERTY_MANAGER,
    ROLE_TENANT, ROLE_VENDOR, ROLE_OWNER,
)


def _user(db, username, role, company=None, status="active", full_name=None):
    u = User(
        id=str(uuid.uuid4()), username=username, email=f"{username}@x.com",
        role=role, company_id=company.id if company else None,
        status=status, full_name=full_name,
    )
    db.add(u)
    return u


@pytest.fixture
def world(db_session):
    acme = Company(id=str(uuid.uuid4()), name="Acme Properties", slug="acme-properties", company_code="acme")
    other = Company(id=str(uuid.uuid4()), name="Globex Realty", slug="globex", company_code="GLBX-01")
    empty = Company(id=str(uuid.uuid4()), name="Empty Co", slug="empty-co", company_code="EMPT-01")
    db_session.add_all([acme, other, empty])
    db_session.flush()

    sa = _user(db_session, "superadmin", ROLE_SUPER_ADMIN)
    _user(db_session, "admin_acme", ROLE_COMPANY_ADMIN, acme, full_name="Alex Admin")
    _user(db_session, "pm1", ROLE_PROPERTY_MANAGER, acme, full_name="Priya Manager")
    _user(db_session, "pm2", ROLE_PROPERTY_MANAGER, acme, status="suspended")
    _user(db_session, "tenant1", ROLE_TENANT, acme)
    _user(db_session, "tenant2", ROLE_TENANT, acme, status="invited")
    _user(db_session, "vendor1", ROLE_VENDOR, acme)
    _user(db_session, "owner1", ROLE_OWNER, acme)
    _user(db_session, "admin_globex", ROLE_COMPANY_ADMIN, other)
    db_session.commit()
    return {"sa": sa, "acme": acme, "other": other, "empty": empty}


# ── /admin/dashboard ─────────────────────────────────────────────────────────
def test_dashboard_counts_come_from_db(client_factory, world):
    res = client_factory(world["sa"]).get("/admin/dashboard")
    assert res.status_code == 200
    d = res.json()
    assert d["total_companies"] == 3
    assert d["total_users"] == 8            # Super Admin is not counted
    assert d["role_counts"] == {
        ROLE_COMPANY_ADMIN: 2, ROLE_ADMIN: 0, ROLE_PROPERTY_MANAGER: 2,
        ROLE_OWNER: 1, ROLE_TENANT: 2, ROLE_VENDOR: 1,
    }
    assert sum(d["role_counts"].values()) == d["total_users"]
    by_name = {c["name"]: c for c in d["companies"]}
    assert by_name["Acme Properties"]["user_count"] == 7
    assert by_name["Empty Co"]["user_count"] == 0     # zero-user companies included
    assert by_name["Acme Properties"]["created_at"]


def test_dashboard_reflects_new_users(client_factory, world, db_session):
    client = client_factory(world["sa"])
    before = client.get("/admin/dashboard").json()
    _user(db_session, "tenant3", ROLE_TENANT, world["other"])
    db_session.commit()
    after = client.get("/admin/dashboard").json()
    assert after["total_users"] == before["total_users"] + 1
    assert after["role_counts"][ROLE_TENANT] == before["role_counts"][ROLE_TENANT] + 1


@pytest.mark.parametrize("who", [ROLE_COMPANY_ADMIN, ROLE_PROPERTY_MANAGER, ROLE_TENANT])
def test_dashboard_forbidden_for_non_super_admin(client_factory, world, db_session, who):
    u = _user(db_session, f"x_{who[:3]}", who, world["acme"])
    db_session.commit()
    assert client_factory(u).get("/admin/dashboard").status_code == 403


# ── /users backwards compatibility ───────────────────────────────────────────
def test_users_without_page_is_still_a_plain_list(client_factory, world):
    res = client_factory(world["sa"]).get("/users")
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    assert len(res.json()) == 9            # legacy behaviour: includes Super Admin


def test_users_never_expose_password_fields(client_factory, world):
    res = client_factory(world["sa"]).get("/users?page=1")
    for row in res.json()["items"]:
        assert "password" not in row and "reset_token" not in row


# ── /users search / filters / pagination ─────────────────────────────────────
def _names(res):
    return {r["username"] for r in res.json()["items"]}


@pytest.mark.parametrize("term, expected", [
    ("admin_acme",        {"admin_acme"}),                       # username
    ("Alex",              {"admin_acme"}),                       # full name
    ("tenant1@x.com",     {"tenant1"}),                          # email
    ("globex",            {"admin_globex"}),                     # company name / slug
    ("GLBX-01",           {"admin_globex"}),                     # company code, case-insensitive
    ("glbx-01",           {"admin_globex"}),
    ("acme-properties",   {"admin_acme", "pm1", "pm2", "tenant1", "tenant2", "vendor1", "owner1"}),  # slug
    ("Property Manager",  {"pm1", "pm2"}),                       # role
    ("suspended",         {"pm2"}),                              # status
    ("nothing-matches",   set()),
])
def test_global_search(client_factory, world, term, expected):
    res = client_factory(world["sa"]).get("/users", params={"search": term, "page": 1, "page_size": 50})
    assert res.status_code == 200
    assert _names(res) == expected


def test_search_treats_wildcards_literally(client_factory, world):
    client = client_factory(world["sa"])
    assert client.get("/users", params={"search": "%", "page": 1}).json()["total"] == 0
    assert client.get("/users", params={"search": "_", "page": 1}).json()["total"] == 2   # only admin_acme, admin_globex (unescaped would match all 8)


def test_company_filter_and_search_combine(client_factory, world):
    res = client_factory(world["sa"]).get(
        "/users", params={"company_id": world["acme"].id, "search": "tenant", "page": 1})
    assert _names(res) == {"tenant1", "tenant2"}
    assert client_factory(world["sa"]).get(
        "/users", params={"company_id": world["empty"].id, "page": 1}).json()["total"] == 0


def test_role_and_status_filters(client_factory, world):
    c = client_factory(world["sa"])
    assert _names(c.get("/users", params={"role": ROLE_TENANT, "page": 1})) == {"tenant1", "tenant2"}
    assert _names(c.get("/users", params={"status": "invited", "page": 1})) == {"tenant2"}
    assert _names(c.get("/users", params={"role": ROLE_TENANT, "status": "active", "page": 1})) == {"tenant1"}


def test_pagination(client_factory, world):
    c = client_factory(world["sa"])
    p1 = c.get("/users", params={"page": 1, "page_size": 3}).json()
    p3 = c.get("/users", params={"page": 3, "page_size": 3}).json()
    assert p1["total"] == 8 and p1["pages"] == 3 and len(p1["items"]) == 3
    assert len(p3["items"]) == 2
    # Role ordering: Company Admins first.
    assert p1["items"][0]["role"] == ROLE_COMPANY_ADMIN
    # Pages don't overlap.
    seen = [r["user_id"] for pg in (1, 2, 3)
            for r in c.get("/users", params={"page": pg, "page_size": 3}).json()["items"]]
    assert len(seen) == len(set(seen)) == 8


def test_page_size_is_capped(client_factory, world):
    assert client_factory(world["sa"]).get("/users?page=1&page_size=1000").status_code == 422


# ── tenancy / RBAC ───────────────────────────────────────────────────────────
def test_company_admin_cannot_read_another_company(client_factory, world, db_session):
    globex_admin = db_session.query(User).filter(User.username == "admin_globex").one()
    res = client_factory(globex_admin).get(
        "/users", params={"company_id": world["acme"].id, "page": 1})
    assert res.status_code == 200
    assert _names(res) == {"admin_globex"}     # forced to own company, param ignored


def test_tenant_cannot_list_users(client_factory, world, db_session):
    t = _user(db_session, "t_x", ROLE_TENANT, world["acme"])
    db_session.commit()
    assert client_factory(t).get("/users?page=1").status_code == 403
