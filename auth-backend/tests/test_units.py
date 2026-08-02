"""
Unit + Lease API regression suite (Day 3 / Day 6 coverage).

Run with:  pytest tests/test_units.py -v
"""
import uuid

from models import Property, User


def make_property(db_session, company, created_by="pm_a"):
    p = Property(id=str(uuid.uuid4()), company_id=company.id, name="Test Tower", created_by=created_by, total_units=10)
    db_session.add(p)
    db_session.commit()
    return p


# ---------- Unit CRUD ----------

def test_create_unit_success(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, created_by=pm_user.username)
    client = client_factory(pm_user)
    res = client.post(f"/properties/{prop.id}/units", json={"unit_number": "1A", "type": "1BR"})
    assert res.status_code == 201
    assert res.json()["unit_number"] == "1A"
    assert res.json()["status"] == "vacant"


def test_create_unit_wrong_company_blocked(db_session, company_a, company_b, pm_user, client_factory):
    prop_b = make_property(db_session, company_b, created_by="someone_else")
    client = client_factory(pm_user)  # pm_user belongs to company_a
    res = client.post(f"/properties/{prop_b.id}/units", json={"unit_number": "1A", "type": "1BR"})
    assert res.status_code == 404


def test_get_units_empty_list(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, created_by=pm_user.username)
    client = client_factory(pm_user)
    res = client.get(f"/properties/{prop.id}/units")
    assert res.status_code == 200
    assert res.json() == []


def test_update_unit_partial(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, created_by=pm_user.username)
    client = client_factory(pm_user)
    unit = client.post(f"/properties/{prop.id}/units", json={"unit_number": "2B", "type": "2BR", "sqft": 900}).json()
    res = client.put(f"/units/{unit['id']}", json={"sqft": 1100})
    assert res.status_code == 200
    assert res.json()["sqft"] == 1100
    assert res.json()["unit_number"] == "2B"  # unchanged


def test_delete_unit_no_lease(db_session, company_a, admin_user, client_factory):
    prop = make_property(db_session, company_a, created_by=admin_user.username)
    client = client_factory(admin_user)
    unit = client.post(f"/properties/{prop.id}/units", json={"unit_number": "3C", "type": "Studio"}).json()
    res = client.delete(f"/units/{unit['id']}")
    assert res.status_code == 200
    assert client.get(f"/properties/{prop.id}/units").json() == []


def test_delete_unit_blocked_by_active_lease(db_session, company_a, admin_user, client_factory):
    prop = make_property(db_session, company_a, created_by=admin_user.username)
    client = client_factory(admin_user)
    unit = client.post(f"/properties/{prop.id}/units", json={"unit_number": "4D", "type": "Studio"}).json()
    client.post("/leases", json={
        "unit_id": unit["id"], "start_date": "2026-01-01", "monthly_rent": 15000,
    })
    res = client.delete(f"/units/{unit['id']}")
    assert res.status_code == 400
    assert "active lease" in res.json()["detail"]


def test_company_b_cannot_edit_company_a_unit(db_session, company_a, company_b, pm_user, client_factory):
    prop = make_property(db_session, company_a, created_by=pm_user.username)
    client_a = client_factory(pm_user)
    unit = client_a.post(f"/properties/{prop.id}/units", json={"unit_number": "5E", "type": "Studio"}).json()

    from models import User
    intruder = User(id=str(uuid.uuid4()), username="pm_b", email="pm_b@example.com",
                     role=pm_user.role, company_id=company_b.id, status="active")
    db_session.add(intruder)
    db_session.commit()

    client_b = client_factory(intruder)
    res = client_b.put(f"/units/{unit['id']}", json={"sqft": 500})
    assert res.status_code == 404


# ---------- Lease CRUD (Day 6) ----------

def test_create_lease_sets_unit_occupied(db_session, company_a, admin_user, client_factory):
    prop = make_property(db_session, company_a, created_by=admin_user.username)
    client = client_factory(admin_user)
    unit = client.post(f"/properties/{prop.id}/units", json={"unit_number": "6F", "type": "1BR"}).json()

    res = client.post("/leases", json={
        "unit_id": unit["id"], "start_date": "2026-01-01", "monthly_rent": 20000,
    })
    assert res.status_code == 201
    assert res.json()["status"] == "active"

    units = client.get(f"/properties/{prop.id}/units").json()
    assert units[0]["status"] == "occupied"


def test_create_lease_on_already_leased_unit_blocked(db_session, company_a, admin_user, client_factory):
    prop = make_property(db_session, company_a, created_by=admin_user.username)
    client = client_factory(admin_user)
    unit = client.post(f"/properties/{prop.id}/units", json={"unit_number": "7G", "type": "1BR"}).json()
    client.post("/leases", json={"unit_id": unit["id"], "start_date": "2026-01-01", "monthly_rent": 20000})

    res = client.post("/leases", json={"unit_id": unit["id"], "start_date": "2026-02-01", "monthly_rent": 21000})
    assert res.status_code == 400
    assert "already has an active lease" in res.json()["detail"]


def test_get_unit_lease_404_when_none(db_session, company_a, admin_user, client_factory):
    prop = make_property(db_session, company_a, created_by=admin_user.username)
    client = client_factory(admin_user)
    unit = client.post(f"/properties/{prop.id}/units", json={"unit_number": "8H", "type": "1BR"}).json()

    res = client.get(f"/units/{unit['id']}/lease")
    assert res.status_code == 404


def test_terminate_lease_frees_unit(db_session, company_a, admin_user, client_factory):
    prop = make_property(db_session, company_a, created_by=admin_user.username)
    client = client_factory(admin_user)
    unit = client.post(f"/properties/{prop.id}/units", json={"unit_number": "9I", "type": "1BR"}).json()
    lease = client.post("/leases", json={"unit_id": unit["id"], "start_date": "2026-01-01", "monthly_rent": 20000}).json()

    res = client.put(f"/leases/{lease['id']}", json={"status": "terminated"})
    assert res.status_code == 200
    assert res.json()["status"] == "terminated"

    units = client.get(f"/properties/{prop.id}/units").json()
    assert units[0]["status"] == "vacant"


# ---------- Unit capacity enforcement ----------

def test_unit_creation_blocked_when_capacity_reached(db_session, company_a, pm_user, client_factory):
    """A property's total_units is a capacity reserved from the PM's quota.
    create_unit must refuse once that capacity is used up, otherwise the
    quota system can be bypassed entirely via '+ Add Unit'."""
    prop = make_property(db_session, company_a, created_by=pm_user.username)
    prop.total_units = 1
    db_session.commit()

    client = client_factory(pm_user)

    first = client.post(f"/properties/{prop.id}/units", json={"unit_number": "1A", "type": "1BR"})
    assert first.status_code == 201

    second = client.post(f"/properties/{prop.id}/units", json={"unit_number": "1B", "type": "1BR"})
    assert second.status_code == 400
    assert "capacity" in second.json()["detail"].lower()


def test_property_serializer_reports_actual_unit_count(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, created_by=pm_user.username)
    prop.total_units = 5
    db_session.commit()

    client = client_factory(pm_user)
    client.post(f"/properties/{prop.id}/units", json={"unit_number": "1A", "type": "1BR"})
    client.post(f"/properties/{prop.id}/units", json={"unit_number": "1B", "type": "1BR"})

    res = client.get("/properties").json()
    this_prop = next(p for p in res if p["id"] == prop.id)
    assert this_prop["total_units"] == 5          # declared capacity, unchanged
    assert this_prop["actual_unit_count"] == 2     # real units actually created


# ---------- Company Admin restrictions (Day 3) ----------

def test_company_admin_can_manage_units_on_any_pm_property(db_session, company_a, admin_user, client_factory):
    """Unlike a Property Manager, a Company Admin is not restricted to
    properties they personally created — they can manage any property
    within their own company."""
    prop = make_property(db_session, company_a, created_by="some_other_pm")
    prop.total_units = 5
    db_session.commit()

    client = client_factory(admin_user)

    res = client.post(f"/properties/{prop.id}/units", json={"unit_number": "1A", "type": "1BR"})
    assert res.status_code == 201

    unit_id = res.json()["id"]
    upd = client.put(f"/units/{unit_id}", json={"rent_amount": 15000})
    assert upd.status_code == 200

    delete_res = client.delete(f"/units/{unit_id}")
    assert delete_res.status_code == 200


def test_company_admin_still_blocked_across_companies(db_session, company_a, company_b, admin_user, client_factory):
    """Company isolation still applies to Company Admin — they can manage
    any property in their own company, but not another company's."""
    prop_b = make_property(db_session, company_b, created_by="pm_in_company_b")
    prop_b.total_units = 5
    db_session.commit()

    client = client_factory(admin_user)  # admin_user belongs to company_a

    res = client.post(f"/properties/{prop_b.id}/units", json={"unit_number": "1A", "type": "1BR"})
    assert res.status_code == 404


# ---------- PM unit quota allocation ----------
# Note: per ROLE_HIERARCHY in rbac.py, a Company Admin can only manage
# 'Admin'-role users directly — it's the 'Admin' role that manages
# Property Manager accounts. These tests use regional_admin_user to match.

def test_admin_can_set_pm_unit_quota(db_session, regional_admin_user, pm_user, client_factory):
    client = client_factory(regional_admin_user)
    res = client.put(f"/users/update/{pm_user.username}", json={"units": 50})
    assert res.status_code == 200
    assert res.json()["user"]["max_units"] == 50


def test_quota_cannot_be_set_below_used_units(db_session, regional_admin_user, pm_user, client_factory):
    pm_user.used_units = 10
    db_session.commit()

    client = client_factory(regional_admin_user)
    res = client.put(f"/users/update/{pm_user.username}", json={"units": 5})
    assert res.status_code == 400
    assert "already in use" in res.json()["detail"]


def test_quota_cannot_be_set_on_non_pm_user(db_session, company_a, regional_admin_user, client_factory):
    tenant = User(
        id=str(uuid.uuid4()),
        username="tenant_a",
        email="tenant_a@example.com",
        role="Tenant",
        company_id=company_a.id,
        status="active",
        created_by=regional_admin_user.username,
    )
    db_session.add(tenant)
    db_session.commit()

    client = client_factory(regional_admin_user)
    res = client.put(f"/users/update/{tenant.username}", json={"units": 20})
    assert res.status_code == 400


def test_users_me_returns_quota_fields(db_session, pm_user, client_factory):
    """Regression test: main.py previously had two duplicate /users/me route
    definitions. FastAPI only ever executes the first one registered, which
    was missing max_units/used_units — so this endpoint silently omitted
    quota data even after a successful quota update. This test fails if
    that duplicate ever comes back."""
    pm_user.max_units = 30
    pm_user.used_units = 5
    db_session.commit()

    client = client_factory(pm_user)
    res = client.get("/users/me")
    assert res.status_code == 200
    body = res.json()
    assert body["max_units"] == 30
    assert body["used_units"] == 5