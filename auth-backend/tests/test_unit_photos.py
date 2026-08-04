"""
Unit photo attachment tests (Day 8).

Run with:  pytest tests/test_unit_photos.py -v
"""
import io
import os
import uuid

from models import Property


def make_property_and_unit(db_session, company, client, created_by):
    p = Property(id=str(uuid.uuid4()), company_id=company.id, name="Photo Tower", created_by=created_by, total_units=10)
    db_session.add(p)
    db_session.commit()
    unit = client.post(f"/properties/{p.id}/units", json={"unit_number": "P1", "type": "1BR"}).json()
    return p, unit


def fake_jpeg(size_bytes):
    # Minimal valid-looking JPEG header + padding so content_type sniffing (by filename/extension
    # in this app) treats it as an image; the app trusts the client-declared content_type.
    return io.BytesIO(b"\xff\xd8\xff\xe0" + b"0" * (size_bytes - 4))


def test_upload_photo_under_limit(db_session, company_a, admin_user, client_factory):
    client = client_factory(admin_user)
    prop, unit = make_property_and_unit(db_session, company_a, client, admin_user.username)

    res = client.post(
        f"/units/{unit['id']}/photos",
        files=[("files", ("room.jpg", fake_jpeg(4 * 1024 * 1024), "image/jpeg"))],
    )
    assert res.status_code == 201
    body = res.json()
    assert len(body) == 1
    assert body[0]["filename"] == "room.jpg"
    assert body[0]["url"]

    # File actually landed on disk
    stored_name = body[0]["url"].rsplit("/", 1)[-1]
    assert os.path.exists(os.path.join("uploads", "units", unit["id"], stored_name))


def test_upload_photo_over_limit_rejected(db_session, company_a, admin_user, client_factory):
    client = client_factory(admin_user)
    prop, unit = make_property_and_unit(db_session, company_a, client, admin_user.username)

    res = client.post(
        f"/units/{unit['id']}/photos",
        files=[("files", ("big.jpg", fake_jpeg(6 * 1024 * 1024), "image/jpeg"))],
    )
    assert res.status_code == 400
    assert "too large" in res.json()["detail"]


def test_get_photos_scoped_to_unit(db_session, company_a, admin_user, client_factory):
    client = client_factory(admin_user)
    prop, unit_a = make_property_and_unit(db_session, company_a, client, admin_user.username)
    _, unit_b = make_property_and_unit(db_session, company_a, client, admin_user.username)

    client.post(f"/units/{unit_a['id']}/photos", files=[("files", ("a.jpg", fake_jpeg(1000), "image/jpeg"))])
    client.post(f"/units/{unit_b['id']}/photos", files=[("files", ("b.jpg", fake_jpeg(1000), "image/jpeg"))])

    res = client.get(f"/units/{unit_a['id']}/photos")
    assert res.status_code == 200
    photos = res.json()
    assert len(photos) == 1
    assert photos[0]["filename"] == "a.jpg"


def test_delete_photo_removes_from_disk_and_db(db_session, company_a, admin_user, client_factory):
    client = client_factory(admin_user)
    prop, unit = make_property_and_unit(db_session, company_a, client, admin_user.username)

    upload = client.post(
        f"/units/{unit['id']}/photos",
        files=[("files", ("del.jpg", fake_jpeg(1000), "image/jpeg"))],
    ).json()[0]
    stored_name = upload["url"].rsplit("/", 1)[-1]
    filepath = os.path.join("uploads", "units", unit["id"], stored_name)
    assert os.path.exists(filepath)

    res = client.delete(f"/units/{unit['id']}/photos/{upload['id']}")
    assert res.status_code == 200
    assert not os.path.exists(filepath)

    remaining = client.get(f"/units/{unit['id']}/photos").json()
    assert remaining == []


def test_tenant_cannot_upload_photo(db_session, company_a, admin_user, client_factory):
    admin_client = client_factory(admin_user)
    prop, unit = make_property_and_unit(db_session, company_a, admin_client, admin_user.username)

    from models import User
    from rbac import ROLE_TENANT
    tenant = User(id=str(uuid.uuid4()), username="tenant_a", email="tenant_a@example.com",
                  role=ROLE_TENANT, company_id=company_a.id, status="active")
    db_session.add(tenant)
    db_session.commit()

    tenant_client = client_factory(tenant)
    res = tenant_client.post(
        f"/units/{unit['id']}/photos",
        files=[("files", ("t.jpg", fake_jpeg(1000), "image/jpeg"))],
    )
    assert res.status_code == 403