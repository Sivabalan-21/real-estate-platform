"""
Tenant registration & login flow tests (Day 12).

Covers the parts of the acceptance criteria that don't require an actual
inbox: username auto-generation from email (with differentiation for
duplicate prefixes), the "please complete registration" gate on login
before registration, and the full register -> login round trip landing
on an active Tenant account.

Run with:  pytest tests/test_tenant_registration_flow.py -v
"""
import uuid
from datetime import datetime, timedelta

from models import User
from rbac import ROLE_TENANT
from tokens import create_invite_token


def make_invited_tenant(db_session, company, email, username=None):
    """A Tenant who has been invited but hasn't completed registration yet
    -- same DB shape create_user() leaves behind, built directly here so
    the test doesn't need a full property/unit/lease chain to set up."""
    token, expiry = create_invite_token()
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        username=username,
        role=ROLE_TENANT,
        company_id=company.id,
        status="invited",
        reset_token=token,
        token_type="invite",
        token_expiry=expiry,
    )
    db_session.add(user)
    db_session.commit()
    return user


def test_register_info_returns_tenant_role(db_session, company_a, client_factory):
    tenant = make_invited_tenant(db_session, company_a, "john@example.com")
    # No auth needed for this endpoint -- it's what the registration page
    # calls before the person is logged in at all.
    client = client_factory(tenant)
    res = client.get(f"/register/{tenant.reset_token}")
    assert res.status_code == 200
    assert res.json()["role"] == "Tenant"
    assert res.json()["email"] == "john@example.com"


def test_completing_registration_auto_generates_username_from_email(db_session, company_a, client_factory):
    tenant = make_invited_tenant(db_session, company_a, "john@example.com")
    client = client_factory(tenant)

    res = client.post(f"/complete-registration/{tenant.reset_token}", json={
        "password": "Sup3rSecret!",
        "full_name": "John Doe",
    })
    assert res.status_code == 200
    assert res.json()["username"] == "john_tenant"
    assert res.json()["role"] == "Tenant"

    refreshed = db_session.query(User).filter(User.id == tenant.id).first()
    assert refreshed.username == "john_tenant"
    assert refreshed.status == "active"


def test_duplicate_email_prefixes_get_differentiated_usernames(db_session, company_a, client_factory):
    tenant_gmail = make_invited_tenant(db_session, company_a, "john@gmail.com")
    tenant_hotmail = make_invited_tenant(db_session, company_a, "john@hotmail.com")

    res1 = client_factory(tenant_gmail).post(
        f"/complete-registration/{tenant_gmail.reset_token}",
        json={"password": "Sup3rSecret!"},
    )
    assert res1.json()["username"] == "john_tenant"

    res2 = client_factory(tenant_hotmail).post(
        f"/complete-registration/{tenant_hotmail.reset_token}",
        json={"password": "Sup3rSecret!"},
    )
    assert res2.status_code == 200
    assert res2.json()["username"] == "john_tenant2"
    assert res2.json()["username"] != res1.json()["username"]


def test_login_before_registration_returns_403(db_session, company_a, client_factory):
    tenant = make_invited_tenant(db_session, company_a, "notyet@example.com", username="notyet_tenant")
    client = client_factory(tenant)
    res = client.post("/auth/login", json={
        "username": "notyet_tenant", "password": "whatever", "role": "Tenant",
    })
    assert res.status_code == 403
    assert "complete registration" in res.json()["detail"].lower()


def test_full_register_then_login_round_trip(db_session, company_a, client_factory):
    tenant = make_invited_tenant(db_session, company_a, "priya@example.com")
    client = client_factory(tenant)

    reg = client.post(f"/complete-registration/{tenant.reset_token}", json={
        "password": "Sup3rSecret!",
    })
    assert reg.status_code == 200
    username = reg.json()["username"]
    assert username == "priya_tenant"

    login = client.post("/auth/login", json={
        "username": username, "password": "Sup3rSecret!", "role": "Tenant",
    })
    assert login.status_code == 200
    assert login.json()["role"] == "Tenant"
    assert login.json()["username"] == username