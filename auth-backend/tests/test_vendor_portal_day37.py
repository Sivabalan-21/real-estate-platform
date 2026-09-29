"""Day 37: vendor token portal -- GET job view + PDF quote upload."""
import os
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

import main
from models import (
    MaintenanceTicket, Property, PropertyAssignment, TicketAttachment,
    TicketHistory, Unit, User, Vendor, VendorTicketAccess,
)
from rbac import ROLE_PROPERTY_MANAGER, ROLE_TENANT

PDF_BYTES = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


@pytest.fixture
def sent_emails(monkeypatch):
    sent = []

    async def fake_send_email(email, subject, body):
        sent.append({"to": email, "subject": subject, "body": body})

    monkeypatch.setattr(main, "send_email", fake_send_email)
    return sent


@pytest.fixture(autouse=True)
def tmp_uploads(tmp_path, monkeypatch):
    """Run from a temp dir so uploaded PDFs never land in the repo."""
    (tmp_path / "uploads").mkdir()
    monkeypatch.chdir(tmp_path)


@pytest.fixture
def portal(db_session, company_a):
    """A ticket in quote_requested with a live token. Returns a namespace."""
    def user(username, role, **kw):
        u = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
                 role=role, company_id=company_a.id, status="active", **kw)
        db_session.add(u)
        return u

    pm = user("pm_d37", ROLE_PROPERTY_MANAGER, full_name="Priya Manager", phone="+91 90000 11111")
    tenant = user("tenant_d37", ROLE_TENANT, full_name="Secret Tenant")
    tenant.email = "secret.tenant@example.com"
    prop = Property(id=str(uuid.uuid4()), company_id=company_a.id, name="Oak Residences",
                    address="12 MG Road, Bengaluru", total_units=1)
    db_session.add(prop)
    db_session.commit()
    unit = Unit(id=str(uuid.uuid4()), property_id=prop.id, unit_number="2A", type="2BR")
    db_session.add(unit)
    db_session.add(PropertyAssignment(id=str(uuid.uuid4()), property_id=prop.id, pm_username=pm.username))
    vendor = Vendor(company_id=company_a.id, name="Acme Plumbing", category="Plumbing",
                    email="acme@example.com", phone="9999900000")
    db_session.add(vendor)
    db_session.commit()

    ticket = MaintenanceTicket(
        id=str(uuid.uuid4()), company_id=company_a.id, property_id=prop.id, unit_id=unit.id,
        title="Leaking tap", description="Kitchen tap leaks constantly", category="Plumbing",
        status="quote_requested", created_by=tenant.username, assigned_pm=pm.username,
        assigned_vendor_id=vendor.id,
    )
    db_session.add(ticket)
    db_session.add(TicketAttachment(
        ticket_id=ticket.id, url="http://x/uploads/tickets/a.png", filename="a.png",
        type="photo", uploaded_by=tenant.username))
    access = VendorTicketAccess(
        token="tok-" + uuid.uuid4().hex, vendor_id=vendor.id, ticket_id=ticket.id,
        expires_at=datetime.utcnow() + timedelta(days=7))
    db_session.add(access)
    db_session.commit()

    class NS: pass
    ns = NS()
    ns.pm, ns.ticket, ns.vendor, ns.access, ns.tenant = pm, ticket, vendor, access, tenant
    return ns


@pytest.fixture
def api(db_session):
    def _get_db():
        yield db_session
    main.app.dependency_overrides[main.get_db] = _get_db
    yield TestClient(main.app)
    main.app.dependency_overrides.pop(main.get_db, None)


def _upload(api, token, content=PDF_BYTES, name="quote.pdf", amount=None, ctype="application/pdf"):
    data = {"quote_amount": amount} if amount is not None else {}
    return api.post(f"/vendor-access/{token}/upload", files={"file": (name, content, ctype)}, data=data)


# ------------------------------- GET ---------------------------------------
def test_valid_token_shows_job_details_and_photos(api, portal):
    r = api.get(f"/vendor-access/{portal.access.token}")
    assert r.status_code == 200
    b = r.json()
    assert b["job_title"] == "Plumbing Repair \u2014 Unit 2A, Oak Residences"
    assert b["description"] == "Kitchen tap leaks constantly"
    assert b["property_address"] == "12 MG Road, Bengaluru"
    assert b["unit_number"] == "2A"
    assert len(b["photos"]) == 1 and b["photos"][0]["url"].endswith("a.png")
    assert b["pm"] == {"name": "Priya Manager", "phone": "+91 90000 11111"}
    assert b["can_submit_quote"] is True


def test_response_never_leaks_tenant_info(api, portal):
    text = api.get(f"/vendor-access/{portal.access.token}").text
    assert "Secret Tenant" not in text
    assert "secret.tenant@example.com" not in text
    assert portal.tenant.username not in text


def test_unknown_token_404(api, portal):
    r = api.get("/vendor-access/nope")
    assert r.status_code == 404 and r.json()["detail"]["code"] == "invalid"


def test_expired_token_410(api, db_session, portal):
    portal.access.expires_at = datetime.utcnow() - timedelta(minutes=1)
    db_session.commit()
    r = api.get(f"/vendor-access/{portal.access.token}")
    assert r.status_code == 410
    assert r.json()["detail"]["code"] == "expired"
    assert r.json()["detail"]["message"] == "This link has expired. Contact your property manager."


def test_revoked_token_treated_as_expired(api, db_session, portal):
    portal.access.revoked = True
    db_session.commit()
    assert api.get(f"/vendor-access/{portal.access.token}").json()["detail"]["code"] == "expired"


@pytest.mark.parametrize("status", ["closed", "completed"])
def test_finished_job_shows_already_completed(api, db_session, portal, status):
    portal.ticket.status = status
    db_session.commit()
    r = api.get(f"/vendor-access/{portal.access.token}")
    assert r.status_code == 410
    assert r.json()["detail"] == {"code": "job_completed", "message": "This job is already completed."}


# ------------------------------- UPLOAD ------------------------------------
def test_upload_pdf_creates_quote_and_transitions(api, db_session, portal, sent_emails):
    r = _upload(api, portal.access.token, amount="4,500")
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "quote_received"

    db_session.refresh(portal.ticket)
    assert portal.ticket.status == "quote_received"
    assert portal.ticket.quote_amount == 4500.0

    att = db_session.query(TicketAttachment).filter_by(ticket_id=portal.ticket.id, type="quote").one()
    assert att.filename == "quote.pdf" and att.uploaded_by == "vendor:Acme Plumbing"

    hist = db_session.query(TicketHistory).filter_by(ticket_id=portal.ticket.id).one()
    assert (hist.from_status, hist.to_status) == ("quote_requested", "quote_received")

    assert len(sent_emails) == 1
    assert sent_emails[0]["to"] == "pm_d37@example.com"
    assert f"/pm/tickets/{portal.ticket.id}" in sent_emails[0]["body"]


def test_amount_is_optional(api, db_session, portal, sent_emails):
    assert _upload(api, portal.access.token).status_code == 201
    db_session.refresh(portal.ticket)
    assert portal.ticket.quote_amount is None and portal.ticket.status == "quote_received"


def test_non_pdf_rejected(api, db_session, portal, sent_emails):
    r = _upload(api, portal.access.token, content=b"\x89PNG....", name="quote.pdf")
    assert r.status_code == 400
    db_session.refresh(portal.ticket)
    assert portal.ticket.status == "quote_requested"
    assert db_session.query(TicketAttachment).filter_by(type="quote").count() == 0
    assert sent_emails == []


def test_bad_amount_rejected(api, portal):
    assert _upload(api, portal.access.token, amount="abc").status_code == 400
    assert _upload(api, portal.access.token, amount="-5").status_code == 400


def test_second_upload_rejected(api, portal, sent_emails):
    assert _upload(api, portal.access.token).status_code == 201
    assert _upload(api, portal.access.token).status_code == 400
    assert len(sent_emails) == 1


def test_expired_token_cannot_upload(api, db_session, portal):
    portal.access.expires_at = datetime.utcnow() - timedelta(days=1)
    db_session.commit()
    assert _upload(api, portal.access.token).status_code == 410
    assert db_session.query(TicketAttachment).filter_by(type="quote").count() == 0


def test_email_failure_does_not_undo_upload(api, db_session, portal, monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("smtp down")
    monkeypatch.setattr(main, "send_email", boom)
    assert _upload(api, portal.access.token).status_code == 201
    db_session.refresh(portal.ticket)
    assert portal.ticket.status == "quote_received"


def test_token_is_scoped_to_its_own_ticket(api, db_session, company_a, portal):
    """A token can only ever touch its own ticket."""
    other = MaintenanceTicket(
        id=str(uuid.uuid4()), company_id=company_a.id, property_id=portal.ticket.property_id,
        title="Other", status="quote_requested", created_by="x")
    db_session.add(other); db_session.commit()
    assert _upload(api, portal.access.token).status_code == 201
    db_session.refresh(other)
    assert other.status == "quote_requested"
