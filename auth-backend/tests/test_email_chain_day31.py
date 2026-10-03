"""
Day 31 -- downstream email chain.

- Owner approves -> PM gets 'Owner Approved' email
- Owner rejects  -> PM gets 'Owner Rejected' email with the owner's comment
                    and the 'Next step' line
- Ticket closed  -> Tenant gets the closure email with a /rate/<token> link
- Ticket moves to In Progress -> Tenant gets the brief status update (NOT
  the closure email)
- Email failures never break the API call

Run with:  pytest tests/test_email_chain_day31.py -v
"""
import re
import uuid

import pytest

import main
from models import MaintenanceTicket, Property, PropertyAssignment, TicketComment, Unit, User
from rbac import ROLE_OWNER, ROLE_PROPERTY_MANAGER, ROLE_TENANT


@pytest.fixture
def sent_emails(monkeypatch):
    sent = []

    async def fake_send_email(email, subject, body):
        sent.append({"to": email, "subject": subject, "body": body})

    monkeypatch.setattr(main, "send_email", fake_send_email)
    return sent


def _user(db, company, username, role, full_name=None):
    u = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
             role=role, company_id=company.id, status="active", full_name=full_name)
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def world(db_session, company_a):
    owner = _user(db_session, company_a, "owner_d31", ROLE_OWNER)
    pm = _user(db_session, company_a, "pm_d31", ROLE_PROPERTY_MANAGER, "Priya PM")
    tenant = _user(db_session, company_a, "tenant_d31", ROLE_TENANT, "Tara Tenant")
    prop = Property(id=str(uuid.uuid4()), company_id=company_a.id, name="Sunrise Tower", total_units=1)
    db_session.add(prop)
    db_session.add(PropertyAssignment(id=str(uuid.uuid4()), property_id=prop.id, pm_username=pm.username))
    db_session.commit()
    unit = Unit(id=str(uuid.uuid4()), property_id=prop.id, unit_number="A-101",
                type="2BHK", status="occupied")
    db_session.add(unit)
    db_session.commit()

    def make_ticket(status):
        t = MaintenanceTicket(
            id=str(uuid.uuid4()), company_id=company_a.id, property_id=prop.id,
            unit_id=unit.id, title="Leaking tap", category="Plumbing", status=status,
            created_by=tenant.username, assigned_pm=pm.username,
            description="Kitchen tap is leaking.",
        )
        db_session.add(t)
        db_session.commit()
        return t

    return {"owner": owner, "pm": pm, "tenant": tenant, "make_ticket": make_ticket}


def test_owner_approves_notifies_pm(world, client_factory, sent_emails):
    t = world["make_ticket"]("pending_owner_approval")
    res = client_factory(world["owner"]).post(f"/tickets/{t.id}/approve", json={"comment": "Go ahead"})
    assert res.status_code == 200
    mail = [m for m in sent_emails if m["to"] == world["pm"].email]
    assert len(mail) == 1
    assert mail[0]["subject"] == "Owner Approved — Sunrise Tower Unit A-101"
    assert "Go ahead" in mail[0]["body"]
    assert "Next step" not in mail[0]["body"]


def test_owner_rejects_notifies_pm_with_next_steps(world, client_factory, sent_emails):
    t = world["make_ticket"]("pending_owner_approval")
    res = client_factory(world["owner"]).post(f"/tickets/{t.id}/reject", json={"comment": "Too expensive"})
    assert res.status_code == 200
    mail = [m for m in sent_emails if m["to"] == world["pm"].email]
    assert len(mail) == 1                       # no duplicate rejection email
    assert mail[0]["subject"] == "Owner Rejected — Sunrise Tower Unit A-101"
    assert "Too expensive" in mail[0]["body"]
    assert "Next step: get a revised quote or contact the owner." in mail[0]["body"]


def test_close_notifies_tenant_with_rating_link(world, db_session, client_factory, sent_emails):
    t = world["make_ticket"]("completed")
    db_session.add(TicketComment(ticket_id=t.id, author_username=world["pm"].username,
                                 author_role=ROLE_PROPERTY_MANAGER, body="Replaced the washer.",
                                 visible_to="all"))
    db_session.commit()

    res = client_factory(world["pm"]).post(
        f"/tickets/{t.id}/transition", json={"new_status": "closed", "note": "Fixed"})
    assert res.status_code == 200, res.text

    mail = [m for m in sent_emails if m["to"] == world["tenant"].email]
    assert len(mail) == 1
    assert mail[0]["subject"] == "Your maintenance request has been resolved — Plumbing"
    assert "Replaced the washer." in mail[0]["body"]
    assert "To stop receiving updates, contact your property manager." in mail[0]["body"]

    db_session.refresh(t)
    assert t.rating_token
    assert re.search(rf"/rate/{re.escape(t.rating_token)}\b", mail[0]["body"])


def test_in_progress_sends_brief_update_not_closure(world, client_factory, sent_emails):
    t = world["make_ticket"]("approved")
    res = client_factory(world["pm"]).post(
        f"/tickets/{t.id}/transition", json={"new_status": "in_progress"})
    assert res.status_code == 200, res.text

    mail = [m for m in sent_emails if m["to"] == world["tenant"].email]
    assert len(mail) == 1
    assert mail[0]["subject"] == "Update on your request — Plumbing"
    assert "In Progress" in mail[0]["body"]
    assert "/rate/" not in mail[0]["body"]
    assert "To stop receiving updates" in mail[0]["body"]


def test_email_failure_does_not_break_transition(world, client_factory, monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(main, "send_email", boom)
    t = world["make_ticket"]("approved")
    res = client_factory(world["pm"]).post(
        f"/tickets/{t.id}/transition", json={"new_status": "in_progress"})
    assert res.status_code == 200


def test_completed_asks_vendor_for_invoice(world, db_session, company_a, client_factory, sent_emails):
    from models import Vendor
    vendor = Vendor(company_id=company_a.id, name="Acme Plumbing", category="Plumbing",
                    email="acme@example.com", phone="9999900000")
    db_session.add(vendor)
    db_session.commit()
    t = world["make_ticket"]("in_progress")
    t.assigned_vendor_id = vendor.id
    db_session.commit()

    res = client_factory(world["pm"]).post(
        f"/tickets/{t.id}/transition", json={"new_status": "completed"})
    assert res.status_code == 200, res.text

    vendor_mail = [m for m in sent_emails if m["to"] == "acme@example.com"]
    assert len(vendor_mail) == 1
    assert "submit your invoice" in vendor_mail[0]["subject"]
    assert "/vendor-access/" in vendor_mail[0]["body"]
    # tenant still gets the brief 'Completed' update
    assert any(m["to"] == world["tenant"].email and "Completed" in m["body"] for m in sent_emails)


def test_vendor_invoice_upload_notifies_pm(world, db_session, company_a, client_factory, sent_emails):
    from models import Vendor, VendorTicketAccess
    from tokens import create_vendor_access_token
    from fastapi.testclient import TestClient
    vendor = Vendor(company_id=company_a.id, name="Acme Plumbing", category="Plumbing",
                    email="acme@example.com", phone="9999900000")
    db_session.add(vendor)
    db_session.commit()
    t = world["make_ticket"]("completed")
    t.assigned_vendor_id = vendor.id
    token, exp = create_vendor_access_token()
    db_session.add(VendorTicketAccess(token=token, vendor_id=vendor.id, ticket_id=t.id,
                                      expires_at=exp, created_by="system"))
    db_session.commit()

    client = client_factory(world["pm"])   # token route needs no login; reuse the wired client
    res = client.post(f"/vendor-access/{token}/invoice",
                      files={"file": ("inv.pdf", b"%PDF-1.4 test", "application/pdf")})
    assert res.status_code == 201, res.text

    mail = [m for m in sent_emails if m["to"] == world["pm"].email]
    assert len(mail) == 1
    assert mail[0]["subject"].startswith("Invoice Received")
    assert "Acme Plumbing" in mail[0]["body"]
