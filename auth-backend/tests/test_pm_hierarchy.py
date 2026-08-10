"""
GET /users/my-hierarchy for Property Manager.

The endpoint's role branch only ever handled Super Admin, Company Admin,
and Regional Manager -- Property Manager fell through to the catch-all
`else: users = []`, so a PM's own "Tenants" page always showed empty
regardless of who they'd actually invited. This confirms the fix: a PM
sees the users they created (matching Regional Manager's created_by
scoping), and not users created by someone else.

Run with:  pytest tests/test_pm_hierarchy.py -v
"""
import uuid

from models import User
from rbac import ROLE_TENANT, ROLE_PROPERTY_MANAGER


def make_tenant(db_session, company, created_by, username, email):
    t = User(id=str(uuid.uuid4()), username=username, email=email,
             role=ROLE_TENANT, company_id=company.id, status="active",
             created_by=created_by)
    db_session.add(t)
    db_session.commit()
    return t


def test_pm_sees_tenants_they_created(db_session, company_a, pm_user, client_factory):
    make_tenant(db_session, company_a, pm_user.username, "tenant_a", "tenant_a@example.com")
    make_tenant(db_session, company_a, pm_user.username, "tenant_b", "tenant_b@example.com")

    res = client_factory(pm_user).get("/users/my-hierarchy")
    assert res.status_code == 200
    usernames = {u["username"] for u in res.json()}
    assert usernames == {"tenant_a", "tenant_b"}


def test_pm_does_not_see_tenants_created_by_someone_else(db_session, company_a, pm_user, client_factory):
    other_pm = User(id=str(uuid.uuid4()), username="other_pm", email="other_pm@example.com",
                     role=ROLE_PROPERTY_MANAGER, company_id=company_a.id, status="active")
    db_session.add(other_pm)
    db_session.commit()

    make_tenant(db_session, company_a, other_pm.username, "not_mine", "notmine@example.com")

    res = client_factory(pm_user).get("/users/my-hierarchy")
    assert res.status_code == 200
    assert res.json() == []


def test_pm_with_no_created_users_sees_empty_list_not_error(db_session, pm_user, client_factory):
    res = client_factory(pm_user).get("/users/my-hierarchy")
    assert res.status_code == 200
    assert res.json() == []