"""
GET /users/my-hierarchy for Property Manager.

Two bugs fixed here, in order:

1. The endpoint's role branch never handled Property Manager at all --
   it fell through to the catch-all `else: users = []`, so a PM's own
   "Tenants" page always showed empty regardless of who they'd invited.

2. Once (1) was fixed with simple created_by scoping, a follow-up gap
   showed up: a tenant created directly by a Company Admin (bypassing
   the PM) was invisible to the PM actually responsible for that
   property. A PM should see everyone living on properties assigned to
   them via PropertyAssignment, not just people they personally invited.
   This file covers both the created_by source and the property-based
   source, and that they're unioned (not either/or) and deduped.

Run with:  pytest tests/test_pm_hierarchy.py -v
"""
import uuid

from models import User, Property, Unit, Lease, PropertyAssignment
from rbac import ROLE_TENANT, ROLE_PROPERTY_MANAGER, ROLE_COMPANY_ADMIN


def make_tenant(db_session, company, created_by, username, email):
    t = User(id=str(uuid.uuid4()), username=username, email=email,
             role=ROLE_TENANT, company_id=company.id, status="active",
             created_by=created_by)
    db_session.add(t)
    db_session.commit()
    return t


def make_property(db_session, company, created_by, name="Test Tower"):
    p = Property(id=str(uuid.uuid4()), company_id=company.id, name=name,
                 created_by=created_by, total_units=5)
    db_session.add(p)
    db_session.commit()
    return p


def make_unit(db_session, property_, unit_number="A-101"):
    u = Unit(id=str(uuid.uuid4()), property_id=property_.id, unit_number=unit_number,
              type="2BHK", status="occupied")
    db_session.add(u)
    db_session.commit()
    return u


def assign_pm(db_session, property_, pm_username):
    a = PropertyAssignment(id=str(uuid.uuid4()), property_id=property_.id, pm_username=pm_username)
    db_session.add(a)
    db_session.commit()
    return a


def make_lease(db_session, property_, unit, tenant_username):
    from datetime import date
    lease = Lease(id=str(uuid.uuid4()), property_id=property_.id, unit_id=unit.id,
                   tenant_username=tenant_username, start_date=date(2025, 1, 1),
                   monthly_rent=20000.0, status="active")
    db_session.add(lease)
    db_session.commit()
    return lease


def test_pm_sees_tenants_they_created(db_session, company_a, pm_user, client_factory):
    make_tenant(db_session, company_a, pm_user.username, "tenant_a", "tenant_a@example.com")
    make_tenant(db_session, company_a, pm_user.username, "tenant_b", "tenant_b@example.com")

    res = client_factory(pm_user).get("/users/my-hierarchy")
    assert res.status_code == 200
    usernames = {u["username"] for u in res.json()}
    assert usernames == {"tenant_a", "tenant_b"}


def test_pm_does_not_see_unrelated_tenants(db_session, company_a, pm_user, client_factory):
    other_pm = User(id=str(uuid.uuid4()), username="other_pm", email="other_pm@example.com",
                     role=ROLE_PROPERTY_MANAGER, company_id=company_a.id, status="active")
    db_session.add(other_pm)
    db_session.commit()

    # Created by a different PM, and not on any property assigned to pm_user.
    make_tenant(db_session, company_a, other_pm.username, "not_mine", "notmine@example.com")

    res = client_factory(pm_user).get("/users/my-hierarchy")
    assert res.status_code == 200
    assert res.json() == []


def test_pm_with_no_created_users_sees_empty_list_not_error(db_session, pm_user, client_factory):
    res = client_factory(pm_user).get("/users/my-hierarchy")
    assert res.status_code == 200
    assert res.json() == []


def test_pm_sees_tenant_created_by_company_admin_on_their_property(
    db_session, company_a, pm_user, client_factory
):
    """The exact scenario reported: a Company Admin invites a tenant
    directly for a unit on a property this PM is assigned to. The PM
    should still see that tenant, even though they never sent the invite."""
    prop = make_property(db_session, company_a, "admin1")
    unit = make_unit(db_session, prop)
    assign_pm(db_session, prop, pm_user.username)

    tenant = make_tenant(db_session, company_a, "company_admin_1", "swasthikad123_tenant", "swasthikad123@gmail.com")
    make_lease(db_session, prop, unit, tenant.username)

    res = client_factory(pm_user).get("/users/my-hierarchy")
    assert res.status_code == 200
    usernames = {u["username"] for u in res.json()}
    assert "swasthikad123_tenant" in usernames


def test_pm_does_not_see_tenants_on_unassigned_properties(
    db_session, company_a, pm_user, client_factory
):
    """A tenant on a property this PM is NOT assigned to stays invisible,
    even though they're in the same company -- property scoping, not
    company-wide visibility."""
    prop = make_property(db_session, company_a, "admin1")
    unit = make_unit(db_session, prop)
    # deliberately no PropertyAssignment for pm_user

    tenant = make_tenant(db_session, company_a, "company_admin_1", "other_property_tenant", "other@example.com")
    make_lease(db_session, prop, unit, tenant.username)

    res = client_factory(pm_user).get("/users/my-hierarchy")
    assert res.status_code == 200
    assert res.json() == []


def test_pm_sees_tenant_via_both_sources_without_duplicates(
    db_session, company_a, pm_user, client_factory
):
    """A tenant the PM both personally invited AND manages the property
    for should appear exactly once, not twice."""
    prop = make_property(db_session, company_a, pm_user.username)
    unit = make_unit(db_session, prop)
    assign_pm(db_session, prop, pm_user.username)

    tenant = make_tenant(db_session, company_a, pm_user.username, "double_source_tenant", "double@example.com")
    make_lease(db_session, prop, unit, tenant.username)

    res = client_factory(pm_user).get("/users/my-hierarchy")
    matches = [u for u in res.json() if u["username"] == "double_source_tenant"]
    assert len(matches) == 1


def test_pm_never_sees_themselves_in_their_own_list(db_session, company_a, pm_user, client_factory):
    """Defensive check: even if stale/seeded data set created_by to the
    PM's own username (as happened with a live test account), the PM
    should never appear in their own hierarchy list."""
    pm_user.created_by = pm_user.username
    db_session.commit()

    res = client_factory(pm_user).get("/users/my-hierarchy")
    assert res.status_code == 200
    usernames = {u["username"] for u in res.json()}
    assert pm_user.username not in usernames