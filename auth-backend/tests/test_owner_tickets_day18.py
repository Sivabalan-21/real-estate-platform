"""
Owner read-only ticket view (Day 18).

Covers:
- Owner sees tickets from every property in their company (no per-property
  assignment needed, unlike PM).
- Default filter shows Open + In Progress only; Closed is excluded.
- property_id filter narrows correctly.
- Company isolation: an Owner from Company B can't see Company A's tickets.
- 'Approval Required' badge appears once a ticket is manually set to
  pending_owner_approval, and the pending_approval_count in the summary
  banner reflects it.

Run with:  pytest tests/test_owner_tickets_day18.py -v
"""
import uuid

from models import User, Property, Unit, MaintenanceTicket
from rbac import ROLE_OWNER, ROLE_PROPERTY_MANAGER


def make_owner(db_session, company, username="owner_day18"):
    o = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
              role=ROLE_OWNER, company_id=company.id, status="active")
    db_session.add(o)
    db_session.commit()
    return o


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


def make_ticket(db_session, company, property_, unit, created_by, status="open", title="Leaky faucet"):
    t = MaintenanceTicket(id=str(uuid.uuid4()), company_id=company.id, property_id=property_.id,
                           unit_id=unit.id, title=title, status=status, created_by=created_by)
    db_session.add(t)
    db_session.commit()
    return t


def test_owner_sees_tickets_across_all_company_properties(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    prop1 = make_property(db_session, company_a, "Tower 1")
    prop2 = make_property(db_session, company_a, "Tower 2")
    unit1 = make_unit(db_session, prop1, "1-A")
    unit2 = make_unit(db_session, prop2, "2-A")
    make_ticket(db_session, company_a, prop1, unit1, "tenant1", title="Tower 1 issue")
    make_ticket(db_session, company_a, prop2, unit2, "tenant2", title="Tower 2 issue")

    res = client_factory(owner).get("/owner/tickets")
    assert res.status_code == 200
    body = res.json()
    titles = {t["title"] for t in body["tickets"]}
    assert titles == {"Tower 1 issue", "Tower 2 issue"}
    assert body["open_count"] == 2


def test_closed_ticket_excluded_by_default_filter(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    make_ticket(db_session, company_a, prop, unit, "tenant1", status="open", title="Open ticket")
    make_ticket(db_session, company_a, prop, unit, "tenant1", status="in_progress", title="In progress ticket")
    make_ticket(db_session, company_a, prop, unit, "tenant1", status="closed", title="Closed ticket")

    res = client_factory(owner).get("/owner/tickets")
    assert res.status_code == 200
    titles = {t["title"] for t in res.json()["tickets"]}
    assert titles == {"Open ticket", "In progress ticket"}


def test_filter_by_property_id(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    prop1 = make_property(db_session, company_a, "Tower 1")
    prop2 = make_property(db_session, company_a, "Tower 2")
    unit1 = make_unit(db_session, prop1, "1-A")
    unit2 = make_unit(db_session, prop2, "2-A")
    make_ticket(db_session, company_a, prop1, unit1, "tenant1", title="Tower 1 issue")
    make_ticket(db_session, company_a, prop2, unit2, "tenant2", title="Tower 2 issue")

    res = client_factory(owner).get("/owner/tickets", params={"property_id": prop1.id})
    assert res.status_code == 200
    titles = {t["title"] for t in res.json()["tickets"]}
    assert titles == {"Tower 1 issue"}


def test_filter_by_category(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    plumbing = make_ticket(db_session, company_a, prop, unit, "tenant1", title="Plumbing issue")
    plumbing.category = "Plumbing"
    electrical = make_ticket(db_session, company_a, prop, unit, "tenant1", title="Electrical issue")
    electrical.category = "Electrical"
    db_session.commit()

    res = client_factory(owner).get("/owner/tickets", params={"category": "Plumbing"})
    assert res.status_code == 200
    titles = {t["title"] for t in res.json()["tickets"]}
    assert titles == {"Plumbing issue"}


def test_company_isolation(db_session, company_a, company_b, client_factory):
    owner_a = make_owner(db_session, company_a, "owner_a")
    prop_a = make_property(db_session, company_a, "Company A Tower")
    unit_a = make_unit(db_session, prop_a)
    make_ticket(db_session, company_a, prop_a, unit_a, "tenant_a", title="Company A ticket")

    owner_b = make_owner(db_session, company_b, "owner_b")
    prop_b = make_property(db_session, company_b, "Company B Tower")
    unit_b = make_unit(db_session, prop_b)
    make_ticket(db_session, company_b, prop_b, unit_b, "tenant_b", title="Company B ticket")

    res_a = client_factory(owner_a).get("/owner/tickets")
    res_b = client_factory(owner_b).get("/owner/tickets")

    assert {t["title"] for t in res_a.json()["tickets"]} == {"Company A ticket"}
    assert {t["title"] for t in res_b.json()["tickets"]} == {"Company B ticket"}


def test_owner_cannot_filter_by_other_companys_property(db_session, company_a, company_b, client_factory):
    owner_a = make_owner(db_session, company_a, "owner_a2")
    prop_b = make_property(db_session, company_b, "Company B Tower")

    res = client_factory(owner_a).get("/owner/tickets", params={"property_id": prop_b.id})
    assert res.status_code == 404


def test_approval_required_badge_and_pending_count(db_session, company_a, client_factory):
    """Manually set a ticket to pending_owner_approval (Month 2's status,
    wired but unused today) and confirm the badge flag and summary count
    both reflect it."""
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    make_ticket(db_session, company_a, prop, unit, "tenant1", status="open", title="Regular ticket")
    make_ticket(db_session, company_a, prop, unit, "tenant1",
                status="pending_owner_approval", title="Needs approval")

    client = client_factory(owner)

    # Not in the default (Open/In-Progress) view...
    default_res = client.get("/owner/tickets")
    default_titles = {t["title"] for t in default_res.json()["tickets"]}
    assert "Needs approval" not in default_titles

    # ...but the pending-approval count is already wired regardless.
    assert default_res.json()["pending_approval_count"] == 1

    # Explicit status filter surfaces it, badge included.
    filtered_res = client.get("/owner/tickets", params={"status": "pending_owner_approval"})
    filtered = filtered_res.json()["tickets"]
    assert len(filtered) == 1
    assert filtered[0]["title"] == "Needs approval"
    assert filtered[0]["approval_required"] is True


def test_pending_approval_count_defaults_to_zero(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    make_ticket(db_session, company_a, prop, unit, "tenant1", status="open", title="Just an open ticket")

    res = client_factory(owner).get("/owner/tickets")
    assert res.status_code == 200
    assert res.json()["pending_approval_count"] == 0


def test_owner_can_open_normal_ticket_detail(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a, "detail_owner")
    prop = make_property(db_session, company_a, "Detail Tower")
    unit = make_unit(db_session, prop)
    ticket = make_ticket(
        db_session, company_a, prop, unit, "tenant1",
        status="quote_requested", title="Quote requested repair",
    )

    response = client_factory(owner).get(f"/tickets/{ticket.id}")

    assert response.status_code == 200
    assert response.json()["title"] == "Quote requested repair"
    assert response.json()["approval_required"] is False


def test_owner_cannot_open_another_company_ticket_detail(
    db_session, company_a, company_b, client_factory
):
    owner = make_owner(db_session, company_a, "detail_owner_a")
    prop = make_property(db_session, company_b, "Other Company Tower")
    unit = make_unit(db_session, prop)
    ticket = make_ticket(db_session, company_b, prop, unit, "tenant_b")

    response = client_factory(owner).get(f"/tickets/{ticket.id}")

    assert response.status_code == 403


def test_invalid_status_filter_rejected(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    res = client_factory(owner).get("/owner/tickets", params={"status": "not_a_real_status"})
    assert res.status_code == 400


def test_non_owner_role_forbidden(db_session, company_a, client_factory):
    pm = User(id=str(uuid.uuid4()), username="pm_not_owner", email="pm_not_owner@example.com",
              role=ROLE_PROPERTY_MANAGER, company_id=company_a.id, status="active")
    db_session.add(pm)
    db_session.commit()

    res = client_factory(pm).get("/owner/tickets")
    assert res.status_code == 403