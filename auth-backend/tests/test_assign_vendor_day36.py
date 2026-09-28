"""Day 36: assign vendor -> Quote Requested + secure vendor token + email."""
import uuid
from datetime import datetime, timedelta

import pytest

import main
from models import Property, PropertyAssignment, User, Vendor, VendorTicketAccess
from rbac import ROLE_PROPERTY_MANAGER, ROLE_TENANT


@pytest.fixture
def sent_emails(monkeypatch):
    sent = []

    async def fake_send_email(email, subject, body):
        sent.append({"to": email, "subject": subject, "body": body})

    monkeypatch.setattr(main, "send_email", fake_send_email)
    return sent


def _user(db, company, username, role):
    u = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
             role=role, company_id=company.id, status="active")
    db.add(u); db.commit()
    return u


def _vendor(db, company, name="Acme Plumbing", email="acme@example.com", phone="9999900000"):
    v = Vendor(company_id=company.id, name=name, category="Plumbing", email=email, phone=phone)
    db.add(v); db.commit()
    return v


@pytest.fixture
def setup(db_session, company_a, client_factory):
    pm = _user(db_session, company_a, "pm_d36", ROLE_PROPERTY_MANAGER)
    tenant = _user(db_session, company_a, "tenant_d36", ROLE_TENANT)
    prop = Property(id=str(uuid.uuid4()), company_id=company_a.id, name="Tower", total_units=1)
    db_session.add(prop); db_session.commit()
    db_session.add(PropertyAssignment(id=str(uuid.uuid4()), property_id=prop.id, pm_username=pm.username))
    db_session.commit()
    r = client_factory(tenant).post("/tickets", json={"property_id": prop.id, "category": "Plumbing"})
    assert r.status_code == 201
    return pm, r.json()["id"], prop


def _to_review(client, tid):
    assert client.post(f"/tickets/{tid}/transition", json={"new_status": "pm_review"}).status_code == 200


def test_assign_in_pm_review_transitions_and_emails(db_session, company_a, client_factory, setup, sent_emails):
    pm, tid, _ = setup
    vendor = _vendor(db_session, company_a)
    client = client_factory(pm)
    _to_review(client, tid)

    r = client.post(f"/tickets/{tid}/assign-vendor", json={"vendor_id": vendor.id})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "quote_requested"
    assert body["assigned_vendor"]["name"] == "Acme Plumbing"
    assert body["assigned_vendor"]["phone"] == "9999900000"

    access = db_session.query(VendorTicketAccess).filter_by(ticket_id=tid).one()
    assert access.vendor_id == vendor.id
    assert timedelta(days=6, hours=23) < access.expires_at - datetime.utcnow() <= timedelta(days=7)

    assert len(sent_emails) == 1
    assert sent_emails[0]["to"] == "acme@example.com"
    assert f"/vendor-access/{access.token}" in sent_emails[0]["body"]


def test_assign_in_open_state_rejected(db_session, company_a, client_factory, setup, sent_emails):
    pm, tid, _ = setup
    vendor = _vendor(db_session, company_a)
    r = client_factory(pm).post(f"/tickets/{tid}/assign-vendor", json={"vendor_id": vendor.id})
    assert r.status_code == 400
    assert sent_emails == []
    assert db_session.query(VendorTicketAccess).count() == 0


def test_vendor_from_other_company_rejected(db_session, company_a, company_b, client_factory, setup, sent_emails):
    pm, tid, _ = setup
    foreign = _vendor(db_session, company_b, name="Other Co Vendor")
    client = client_factory(pm)
    _to_review(client, tid)
    r = client.post(f"/tickets/{tid}/assign-vendor", json={"vendor_id": foreign.id})
    assert r.status_code == 400
    assert sent_emails == []


def test_pm_without_property_access_forbidden(db_session, company_a, client_factory, setup, sent_emails):
    pm, tid, _ = setup
    vendor = _vendor(db_session, company_a)
    _to_review(client_factory(pm), tid)
    other_pm = _user(db_session, company_a, "pm_other", ROLE_PROPERTY_MANAGER)
    r = client_factory(other_pm).post(f"/tickets/{tid}/assign-vendor", json={"vendor_id": vendor.id})
    assert r.status_code == 403


def test_email_failure_does_not_roll_back_assignment(db_session, company_a, client_factory, setup, monkeypatch):
    pm, tid, _ = setup
    vendor = _vendor(db_session, company_a)

    async def boom(*a, **k):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(main, "send_email", boom)
    client = client_factory(pm)
    _to_review(client, tid)
    r = client.post(f"/tickets/{tid}/assign-vendor", json={"vendor_id": vendor.id})
    assert r.status_code == 200
    assert r.json()["status"] == "quote_requested"
    assert r.json()["vendor_email_sent"] is False
