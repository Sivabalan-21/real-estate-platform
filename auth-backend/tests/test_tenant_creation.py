"""
Tenant role creation + unit-linkage tests (Day 11).

Run with:  pytest tests/test_tenant_creation.py -v
"""
import uuid

from flask import app

from models import Property, User
from rbac import ROLE_COMPANY_ADMIN


def make_company_admin(db_session, company, username="co_admin_t"):
    admin = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
                 role=ROLE_COMPANY_ADMIN, company_id=company.id, status="active")
    db_session.add(admin)
    db_session.commit()
    return admin


def make_property_and_unit(db_session, company, client, created_by, unit_number="T1"):
    p = Property(id=str(uuid.uuid4()), company_id=company.id, name="Tenant Test Tower",
                 created_by=created_by, total_units=10)
    db_session.add(p)
    db_session.commit()
    unit = client.post(f"/properties/{p.id}/units", json={"unit_number": unit_number, "type": "1BR"}).json()
    return p, unit


def test_create_tenant_without_unit_id_fails(db_session, company_a, client_factory):
    admin = make_company_admin(db_session, company_a)
    client = client_factory(admin)
    res = client.post("/users/create", json={
        "email": "tenant_nounit@example.com", "role": "Tenant", "username": "tenant_nounit",
    })
    assert res.status_code == 400
    assert "unit_id required" in res.json()["detail"]


def test_create_tenant_with_unit_from_other_company_fails(db_session, company_a, company_b, client_factory):
    admin_a = make_company_admin(db_session, company_a, "co_admin_a2")

    # PM in company B creates a unit that belongs to company B
    from rbac import ROLE_PROPERTY_MANAGER
    pm_b = User(id=str(uuid.uuid4()), username="pm_b2", email="pm_b2@example.com",
                role=ROLE_PROPERTY_MANAGER, company_id=company_b.id, status="active")
    db_session.add(pm_b)
    db_session.commit()
    client_b = client_factory(pm_b)
    _, unit_b = make_property_and_unit(db_session, company_b, client_b, created_by="pm_b2")

    # client_factory's override is set on the shared app object, not snapshotted per
    # client — so client_a must be created (and used immediately) AFTER all of company
    # B's setup above, not before it, or this request would silently run as pm_b instead.
    client_a = client_factory(admin_a)
    res = client_a.post("/users/create", json={
        "email": "tenant_crosscompany@example.com", "role": "Tenant",
        "username": "tenant_crosscompany", "unit_id": unit_b["id"],
    })
    assert res.status_code == 400
    assert "Invalid unit" in res.json()["detail"]


def test_create_tenant_with_valid_unit_succeeds(db_session, company_a, admin_user, client_factory):
    admin = make_company_admin(db_session, company_a, "co_admin_a3")
    admin_client = client_factory(admin_user)  # admin_user (PM/whatever fixture) creates the property/unit
    _, unit = make_property_and_unit(db_session, company_a, admin_client, created_by=admin_user.username)

    client = client_factory(admin)
    res = client.post("/users/create", json={
        "email": "tenant_valid@example.com", "role": "Tenant",
        "username": "tenant_valid", "unit_id": unit["id"],
    })
    assert res.status_code == 200

    created = db_session.query(User).filter(User.username == "tenant_valid").first()
    assert created is not None
    assert created.unit_id == unit["id"]
    assert created.role == "Tenant"


def test_tenant_gets_attached_to_existing_unassigned_lease(db_session, company_a, admin_user, client_factory):
    admin = make_company_admin(db_session, company_a, "co_admin_a4")
    admin_client = client_factory(admin_user)
    _, unit = make_property_and_unit(db_session, company_a, admin_client, created_by=admin_user.username, unit_number="T2")

    # Create an active lease with no tenant yet
    lease = admin_client.post("/leases", json={
        "unit_id": unit["id"], "start_date": "2026-01-01", "monthly_rent": 15000,
    }).json()
    assert lease["tenant_username"] is None

    client = client_factory(admin)
    res = client.post("/users/create", json={
        "email": "tenant_lease@example.com", "role": "Tenant", "unit_id": unit["id"],
        # No username here — matches the real invite flow (AdminUsers.js only
        # collects email at invite time; username is chosen at registration).
    })
    assert res.status_code == 200
    invited = db_session.query(User).filter(User.email == "tenant_lease@example.com").first()

    # Linking is deferred to registration by design (invite time has no
    # username to key the lease on yet) — so right after the invite, the
    # lease should still show no tenant.
    still_unlinked = admin_client.get(f"/units/{unit['id']}/lease").json()
    assert still_unlinked["tenant_username"] is None

    # Complete registration using the invite token — this is what actually
    # attaches the tenant to the lease. As of Day 12, a Tenant's username is
    # auto-derived from their invite email (not submitted here), so the
    # registration payload no longer includes one.
    complete_res = admin_client.post(f"/complete-registration/{invited.reset_token}", json={
        "password": "TestPass123!",
    })
    assert complete_res.status_code == 200
    generated_username = complete_res.json()["username"]
    assert generated_username == "tenant_lease_tenant"

    updated_lease = admin_client.get(f"/units/{unit['id']}/lease").json()
    assert updated_lease["tenant_username"] == generated_username


def test_tenant_creation_blocked_if_unit_already_has_registered_tenant(db_session, company_a, admin_user, client_factory):
    admin = make_company_admin(db_session, company_a, "co_admin_a5")
    admin_client = client_factory(admin_user)
    _, unit = make_property_and_unit(db_session, company_a, admin_client, created_by=admin_user.username, unit_number="T3")

    admin_client.post("/leases", json={
        "unit_id": unit["id"], "start_date": "2026-01-01", "monthly_rent": 15000,
    })
    client = client_factory(admin)
    client.post("/users/create", json={"email": "first_tenant@example.com", "role": "Tenant", "unit_id": unit["id"]})
    first = db_session.query(User).filter(User.email == "first_tenant@example.com").first()

    # First tenant actually completes registration, which is what links them
    # to the lease and makes the unit genuinely "taken."
    admin_client.post(f"/complete-registration/{first.reset_token}", json={"username": "first_tenant", "password": "TestPass123!"})

    # A second tenant invite for the same (now-genuinely-assigned) unit should be rejected
    res = client.post("/users/create", json={"email": "second_tenant@example.com", "role": "Tenant", "unit_id": unit["id"]})
    assert res.status_code == 400
    assert "tenant" in res.json()["detail"].lower()


def test_tenant_creation_allowed_with_no_lease_yet(db_session, company_a, admin_user, client_factory):
    admin = make_company_admin(db_session, company_a, "co_admin_a6")
    admin_client = client_factory(admin_user)
    _, unit = make_property_and_unit(db_session, company_a, admin_client, created_by=admin_user.username, unit_number="T4")

    # No lease created at all — PM will do that separately later
    client = client_factory(admin)
    res = client.post("/users/create", json={
        "email": "tenant_nolease@example.com", "role": "Tenant",
        "username": "tenant_nolease", "unit_id": unit["id"],
    })
    assert res.status_code == 200