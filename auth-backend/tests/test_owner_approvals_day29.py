"""
Owner approval inbox (Day 29).

Covers:
- GET /owner/approvals lists only tickets in Pending Owner Approval, with
  property/unit/PM/quote details.
- POST /tickets/{id}/approve transitions to Approved and stores an optional
  comment as an 'owner_pm' scoped TicketComment.
- POST /tickets/{id}/reject requires a reason (400 without one) and stores
  it the same way, transitioning to Rejected.
- A PM cannot call either action (403), and a ticket not awaiting approval
  is rejected with 400.
- Company isolation on the inbox listing.

Run with:  pytest tests/test_owner_approvals_day29.py -v
"""
import uuid

from models import MaintenanceTicket, Property, TicketAttachment, Unit, User
from rbac import ROLE_OWNER, ROLE_PROPERTY_MANAGER


def make_owner(db_session, company, username="owner_day29"):
    o = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
             role=ROLE_OWNER, company_id=company.id, status="active")
    db_session.add(o)
    db_session.commit()
    return o


def make_pm(db_session, company, username="pm_day29"):
    p = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
             role=ROLE_PROPERTY_MANAGER, company_id=company.id, status="active",
             full_name="Priya PM")
    db_session.add(p)
    db_session.commit()
    return p


def make_property(db_session, company, name="Test Tower"):
    p = Property(id=str(uuid.uuid4()), company_id=company.id, name=name, total_units=5)
    db_session.add(p)
    db_session.commit()
    return p


def make_unit(db_session, property_, unit_number="A-101"):
    u = Unit(id=str(uuid.uuid4()), property_id=property_.id, unit_number=unit_number,
             type="2BHK", status="occupied")
    db_session.add(u)
    db_session.commit()
    return u


def make_ticket(db_session, company, property_, unit, created_by, assigned_pm=None,
                status="pending_owner_approval", title="AC repair", quote_amount=None,
                description="The compressor is making a loud noise and not cooling."):
    t = MaintenanceTicket(
        id=str(uuid.uuid4()), company_id=company.id, property_id=property_.id,
        unit_id=unit.id, title=title, status=status, created_by=created_by,
        assigned_pm=assigned_pm, quote_amount=quote_amount, description=description,
    )
    db_session.add(t)
    db_session.commit()
    return t


def test_pending_ticket_appears_in_approvals_inbox(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    pm = make_pm(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    make_ticket(db_session, company_a, prop, unit, "tenant1", assigned_pm=pm.username,
                quote_amount=8500.0, title="AC repair")

    res = client_factory(owner).get("/owner/approvals")
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 1
    approval = body["approvals"][0]
    assert approval["title"] == "AC repair"
    assert approval["property_name"] == prop.name
    assert approval["unit_number"] == "A-101"
    assert approval["pm_name"] == "Priya PM"
    assert approval["quote_amount"] == 8500.0
    assert approval["description_summary"].startswith("The compressor")


def test_open_ticket_not_in_approvals_inbox(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    make_ticket(db_session, company_a, prop, unit, "tenant1", status="open", title="Not pending")

    res = client_factory(owner).get("/owner/approvals")
    assert res.status_code == 200
    assert res.json()["count"] == 0
    assert res.json()["approvals"] == []


def test_company_isolation_on_approvals_inbox(db_session, company_a, company_b, client_factory):
    owner_a = make_owner(db_session, company_a, "owner_a")
    prop_a = make_property(db_session, company_a, "Company A Tower")
    unit_a = make_unit(db_session, prop_a)
    make_ticket(db_session, company_a, prop_a, unit_a, "tenant_a", title="Company A ticket")

    owner_b = make_owner(db_session, company_b, "owner_b")
    prop_b = make_property(db_session, company_b, "Company B Tower")
    unit_b = make_unit(db_session, prop_b)
    make_ticket(db_session, company_b, prop_b, unit_b, "tenant_b", title="Company B ticket")

    res_a = client_factory(owner_a).get("/owner/approvals")
    res_b = client_factory(owner_b).get("/owner/approvals")

    assert {a["title"] for a in res_a.json()["approvals"]} == {"Company A ticket"}
    assert {a["title"] for a in res_b.json()["approvals"]} == {"Company B ticket"}


def test_non_owner_forbidden_from_approvals_inbox(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    res = client_factory(pm).get("/owner/approvals")
    assert res.status_code == 403


def test_owner_approves_with_comment(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    ticket = make_ticket(db_session, company_a, prop, unit, "tenant1")

    res = client_factory(owner).post(
        f"/tickets/{ticket.id}/approve", json={"comment": "Please proceed"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "approved"

    comments = client_factory(owner).get(f"/tickets/{ticket.id}/comments").json()
    assert len(comments) == 1
    assert comments[0]["body"] == "Please proceed"
    assert comments[0]["visible_to"] == "owner_pm"
    assert comments[0]["author_role"] == ROLE_OWNER


def test_owner_approves_without_comment(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    ticket = make_ticket(db_session, company_a, prop, unit, "tenant1")

    res = client_factory(owner).post(f"/tickets/{ticket.id}/approve", json={})
    assert res.status_code == 200
    assert res.json()["status"] == "approved"
    assert client_factory(owner).get(f"/tickets/{ticket.id}/comments").json() == []


def test_owner_reject_without_reason_fails(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    ticket = make_ticket(db_session, company_a, prop, unit, "tenant1")

    res = client_factory(owner).post(f"/tickets/{ticket.id}/reject", json={})
    assert res.status_code == 400
    assert res.json()["detail"] == "Rejection reason required"

    # Blank/whitespace-only reason is treated the same as missing.
    res_blank = client_factory(owner).post(f"/tickets/{ticket.id}/reject", json={"comment": "   "})
    assert res_blank.status_code == 400


def test_owner_reject_with_reason_succeeds(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    ticket = make_ticket(db_session, company_a, prop, unit, "tenant1")

    res = client_factory(owner).post(
        f"/tickets/{ticket.id}/reject", json={"comment": "Quote is over budget"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"

    comments = client_factory(owner).get(f"/tickets/{ticket.id}/comments").json()
    assert comments[0]["body"] == "Quote is over budget"
    assert comments[0]["visible_to"] == "owner_pm"


def test_pm_cannot_approve(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    ticket = make_ticket(db_session, company_a, prop, unit, "tenant1")

    res = client_factory(pm).post(f"/tickets/{ticket.id}/approve", json={"comment": "ok"})
    assert res.status_code == 403


def test_pm_cannot_reject(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    ticket = make_ticket(db_session, company_a, prop, unit, "tenant1")

    res = client_factory(pm).post(f"/tickets/{ticket.id}/reject", json={"comment": "no"})
    assert res.status_code == 403


def test_ticket_not_awaiting_approval_rejected_with_400(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    ticket = make_ticket(db_session, company_a, prop, unit, "tenant1", status="open")

    res = client_factory(owner).post(f"/tickets/{ticket.id}/approve", json={})
    assert res.status_code == 400
    assert res.json()["detail"] == "Ticket is not awaiting owner approval"


def test_approved_ticket_leaves_approvals_inbox(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    ticket = make_ticket(db_session, company_a, prop, unit, "tenant1")

    client = client_factory(owner)
    assert client.get("/owner/approvals").json()["count"] == 1
    client.post(f"/tickets/{ticket.id}/approve", json={})
    assert client.get("/owner/approvals").json()["count"] == 0


def test_quote_attachment_url_surfaced_when_no_quote_amount(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    ticket = make_ticket(db_session, company_a, prop, unit, "tenant1", quote_amount=None)
    db_session.add(TicketAttachment(
        id=str(uuid.uuid4()), ticket_id=ticket.id, url="/uploads/tickets/quote.pdf",
        filename="quote.pdf", type="quote",
    ))
    db_session.commit()

    res = client_factory(owner).get("/owner/approvals")
    approval = res.json()["approvals"][0]
    assert approval["quote_amount"] is None
    assert approval["quote_attachment_url"] == "/uploads/tickets/quote.pdf"


def test_company_admin_cannot_approve(db_session, company_a, admin_user, client_factory):
    """Only the Owner role gets the approve/reject action — the PM-style
    admin tiers can do everything else with a ticket but not this."""
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    ticket = make_ticket(db_session, company_a, prop, unit, "tenant1")

    res = client_factory(admin_user).post(f"/tickets/{ticket.id}/approve", json={"comment": "ok"})
    assert res.status_code == 403