"""
PATCH /users/me — self-service profile edit.

Any logged-in user can update their own display name / phone. Username,
email, and role stay locked (admin-only, via /users/update/{username}) so
this endpoint can't be used to escalate or impersonate.

Run with:  pytest tests/test_users_me_patch.py -v
"""
from models import User


def test_update_full_name_and_phone(db_session, admin_user, client_factory):
    client = client_factory(admin_user)

    res = client.patch("/users/me", json={"full_name": "Alex Admin", "phone": "+1 555 111 2222"})
    assert res.status_code == 200
    assert res.json()["full_name"] == "Alex Admin"
    assert res.json()["phone"] == "+1 555 111 2222"

    refreshed = db_session.query(User).filter(User.id == admin_user.id).first()
    assert refreshed.full_name == "Alex Admin"
    assert refreshed.phone == "+1 555 111 2222"


def test_clearing_a_field_with_empty_string(db_session, admin_user, client_factory):
    client = client_factory(admin_user)
    client.patch("/users/me", json={"full_name": "Someone", "phone": "12345"})

    res = client.patch("/users/me", json={"phone": ""})
    assert res.status_code == 200
    assert res.json()["phone"] is None
    # full_name untouched since this request didn't mention it
    assert res.json()["full_name"] == "Someone"


def test_partial_update_only_touches_submitted_fields(db_session, admin_user, client_factory):
    client = client_factory(admin_user)
    client.patch("/users/me", json={"full_name": "Original Name", "phone": "111"})

    res = client.patch("/users/me", json={"phone": "222"})
    assert res.status_code == 200
    assert res.json()["phone"] == "222"
    assert res.json()["full_name"] == "Original Name"


def test_cannot_change_username_role_or_email_through_this_endpoint(db_session, admin_user, client_factory):
    client = client_factory(admin_user)
    original_username = admin_user.username
    original_role = admin_user.role
    original_email = admin_user.email

    res = client.patch("/users/me", json={
        "full_name": "Still Me",
        "username": "totally_different_username",
        "role": "Super Admin",
        "email": "hijacked@example.com",
    })
    assert res.status_code == 200

    refreshed = db_session.query(User).filter(User.id == admin_user.id).first()
    assert refreshed.username == original_username
    assert refreshed.role == original_role
    assert refreshed.email == original_email
    assert refreshed.full_name == "Still Me"


def test_requires_authentication(db_session, client_factory):
    # No dependency override for current_user -> real auth path applies,
    # so an unauthenticated request should be rejected before reaching the
    # handler. (client_factory always sets a user, so this hits the app
    # without any override to simulate "no logged-in user".)
    from fastapi.testclient import TestClient
    import main

    def _get_db():
        yield next(iter([db_session]))

    main.app.dependency_overrides[main.get_db] = _get_db
    main.app.dependency_overrides.pop(main.current_user, None)
    client = TestClient(main.app)

    res = client.patch("/users/me", json={"full_name": "No Auth"})
    assert res.status_code in (401, 403)

    main.app.dependency_overrides.clear()