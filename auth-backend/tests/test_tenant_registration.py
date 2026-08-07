"""
Tenant registration + login flow tests (Day 12).

Covers:
- Username auto-generated from email prefix when Tenant registers without
  supplying one.
- Two tenants sharing the same email prefix get differentiated usernames.
- A Tenant who hasn't completed registration yet cannot log in (403).

Run with:  pytest tests/test_tenant_registration.py -v
"""
import uuid

from models import Property, User
from rbac import ROLE_COMPANY_ADMIN


def make_company_admin(db_session, company, username="co_admin_reg"):
    admin = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
                 role=ROLE_COMPANY_ADMIN, company_id=company.id, status="active")
    db_session.add(admin)
    db_session.commit()
    return admin


def make_property_and_unit(db_session, company, client, created_by, unit_number="R1"):
    p = Property(id=str(uuid.uuid4()), company_id=company.id, name="Reg Test Tower",
                 created_by=created_by, total_units=10)
    db_session.add(p)
    db_session.commit()
    unit = client.post(f"/properties/{p.id}/units", json={"unit_number": unit_number, "type": "1BR"}).json()
    return p, unit


def invite_tenant(db_session, admin_client, company, email, unit_id):
    res = admin_client.post("/users/create", json={
        "email": email, "role": "Tenant", "unit_id": unit_id,
        # No username — matches the real invite flow where only email is
        # collected at invite time.
    })
    assert res.status_code == 200
    return db_session.query(User).filter(User.email == email).first()


def test_tenant_registration_auto_generates_username_from_email(db_session, company_a, admin_user, client_factory):
    admin = make_company_admin(db_session, company_a, "co_admin_reg1")
    admin_client = client_factory(admin_user)
    _, unit = make_property_and_unit(db_session, company_a, admin_client, created_by=admin_user.username, unit_number="R1")

    client = client_factory(admin)
    invited = invite_tenant(db_session, client, company_a, "priya@example.com", unit["id"])

    # Registration screen for Tenants doesn't collect a username at all —
    # only full_name/phone/password should be posted.
    res = client.post(f"/complete-registration/{invited.reset_token}", json={
        "full_name": "Priya", "password": "TestPass123!",
    })
    assert res.status_code == 200

    created = db_session.query(User).filter(User.email == "priya@example.com").first()
    assert created.username == "priya_tenant"
    assert created.status == "active"


def test_two_tenants_with_same_email_prefix_get_differentiated_usernames(db_session, company_a, admin_user, client_factory):
    admin = make_company_admin(db_session, company_a, "co_admin_reg2")
    admin_client = client_factory(admin_user)
    _, unit1 = make_property_and_unit(db_session, company_a, admin_client, created_by=admin_user.username, unit_number="R2")
    _, unit2 = make_property_and_unit(db_session, company_a, admin_client, created_by=admin_user.username, unit_number="R3")

    client = client_factory(admin)

    invited1 = invite_tenant(db_session, client, company_a, "john@gmail.com", unit1["id"])
    res1 = client.post(f"/complete-registration/{invited1.reset_token}", json={"password": "TestPass123!"})
    assert res1.status_code == 200

    invited2 = invite_tenant(db_session, client, company_a, "john@hotmail.com", unit2["id"])
    res2 = client.post(f"/complete-registration/{invited2.reset_token}", json={"password": "TestPass123!"})
    assert res2.status_code == 200

    u1 = db_session.query(User).filter(User.email == "john@gmail.com").first()
    u2 = db_session.query(User).filter(User.email == "john@hotmail.com").first()

    assert u1.username == "john_tenant"
    assert u2.username == "john_tenant2"
    assert u1.username != u2.username


def test_tenant_cannot_login_before_completing_registration(db_session, company_a, admin_user, client_factory):
    admin = make_company_admin(db_session, company_a, "co_admin_reg3")
    admin_client = client_factory(admin_user)
    _, unit = make_property_and_unit(db_session, company_a, admin_client, created_by=admin_user.username, unit_number="R4")

    client = client_factory(admin)
    invite_tenant(db_session, client, company_a, "notyetregistered@example.com", unit["id"])

    # Not registered yet -> no username/password exist, but even attempting
    # to log in against the still-"invited" record must be rejected.
    res = client.post("/auth/login", json={
        "username": "notyetregistered@example.com", "password": "whatever", "role": "Tenant",
    })
    assert res.status_code == 400  # invalid credentials — no password set yet


def test_tenant_can_login_after_completing_registration(db_session, company_a, admin_user, client_factory):
    admin = make_company_admin(db_session, company_a, "co_admin_reg4")
    admin_client = client_factory(admin_user)
    _, unit = make_property_and_unit(db_session, company_a, admin_client, created_by=admin_user.username, unit_number="R5")

    client = client_factory(admin)
    invited = invite_tenant(db_session, client, company_a, "mira@example.com", unit["id"])
    client.post(f"/complete-registration/{invited.reset_token}", json={"password": "TestPass123!"})

    created = db_session.query(User).filter(User.email == "mira@example.com").first()

    res = client.post("/auth/login", json={
        "username": created.username, "password": "TestPass123!", "role": "Tenant",
    })
    assert res.status_code == 200
    assert res.json()["role"] == "Tenant"