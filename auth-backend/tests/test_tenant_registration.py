"""
Tenant registration & login flow tests (Day 12).

Covers the parts of the acceptance criteria that don't require an actual
inbox: the tenant registration screen returning the right role, a
required manually-typed username (rejected outright on collision, no
auto-suffixing), the "please complete registration" gate on login before
registration, and the full register -> login round trip landing on an
active Tenant account.

Run with:  pytest tests/test_tenant_registration.py -v
"""
import uuid

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


def test_tenant_can_pick_their_own_username(db_session, company_a, client_factory):
    tenant = make_invited_tenant(db_session, company_a, "john@example.com")
    client = client_factory(tenant)

    res = client.post(f"/complete-registration/{tenant.reset_token}", json={
        "username": "johnny_d",
        "password": "Sup3rSecret!",
        "full_name": "John Doe",
    })
    assert res.status_code == 200
    assert res.json()["username"] == "johnny_d"
    assert res.json()["role"] == "Tenant"

    refreshed = db_session.query(User).filter(User.id == tenant.id).first()
    assert refreshed.username == "johnny_d"
    assert refreshed.status == "active"


def test_tenant_registration_requires_username(db_session, company_a, client_factory):
    tenant = make_invited_tenant(db_session, company_a, "noname@example.com")
    client = client_factory(tenant)

    res = client.post(f"/complete-registration/{tenant.reset_token}", json={
        "password": "Sup3rSecret!",
    })
    assert res.status_code == 400
    assert "username" in res.json()["detail"].lower()


def test_duplicate_username_rejected_outright_not_suffixed(db_session, company_a, client_factory):
    tenant_a = make_invited_tenant(db_session, company_a, "john@gmail.com")
    tenant_b = make_invited_tenant(db_session, company_a, "john@hotmail.com")

    res1 = client_factory(tenant_a).post(
        f"/complete-registration/{tenant_a.reset_token}",
        json={"username": "john_h", "password": "Sup3rSecret!"},
    )
    assert res1.status_code == 200
    assert res1.json()["username"] == "john_h"

    # Second tenant tries the same username -- should be rejected outright,
    # not silently suffixed to "john_h2".
    res2 = client_factory(tenant_b).post(
        f"/complete-registration/{tenant_b.reset_token}",
        json={"username": "john_h", "password": "Sup3rSecret!"},
    )
    assert res2.status_code == 400
    assert "already taken" in res2.json()["detail"].lower()

    # Picking a different username succeeds.
    res3 = client_factory(tenant_b).post(
        f"/complete-registration/{tenant_b.reset_token}",
        json={"username": "john_hm", "password": "Sup3rSecret!"},
    )
    assert res3.status_code == 200
    assert res3.json()["username"] == "john_hm"


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
        "username": "priya_r",
        "password": "Sup3rSecret!",
    })
    assert reg.status_code == 200
    username = reg.json()["username"]
    assert username == "priya_r"

    login = client.post("/auth/login", json={
        "username": username, "password": "Sup3rSecret!", "role": "Tenant",
    })
    assert login.status_code == 200
    assert login.json()["role"] == "Tenant"
    assert login.json()["username"] == username