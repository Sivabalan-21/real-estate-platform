"""
Maintenance ticket -> Owner portfolio integration (Day 10 gap-fill).

The /owner/portfolio endpoint's open_ticket_count was tested in isolation
against hand-inserted MaintenanceTicket rows, but nothing exercised the
actual create/close API a PM uses day to day -- the same one the new
"Maintenance Tickets" panel in PropertyManagement.js calls. This file
closes that loop: create a ticket through the real endpoint, confirm the
Owner's badge count reacts, close it, confirm the badge clears.

Note: client_factory's dependency override lives on the shared main.app
object, so a client only "wins" until the next client_factory(...) call --
call it fresh right before each action rather than reusing an older
client after switching identities (see test_owner_portfolio.py for the
same pattern).

Run with:  pytest tests/test_maintenance_tickets_portfolio.py -v
"""
import uuid

from models import Property, PropertyAssignment, User
from rbac import ROLE_OWNER


def make_owner(db_session, company, username="owner_a"):
    owner = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
                 role=ROLE_OWNER, company_id=company.id, status="active")
    db_session.add(owner)
    db_session.commit()
    return owner


def make_property(db_session, company, created_by, name="Test Tower"):
    p = Property(id=str(uuid.uuid4()), company_id=company.id, name=name,
                 created_by=created_by, total_units=5)
    db_session.add(p)
    db_session.commit()
    return p


def assign_pm(db_session, property_, pm_username):
    db_session.add(PropertyAssignment(
        id=str(uuid.uuid4()), property_id=property_.id, pm_username=pm_username,
    ))
    db_session.commit()


def test_creating_ticket_via_api_raises_portfolio_badge_count(
    db_session, company_a, pm_user, client_factory
):
    prop = make_property(db_session, company_a, pm_user.username)
    assign_pm(db_session, prop, pm_user.username)
    owner = make_owner(db_session, company_a)

    before = client_factory(owner).get("/owner/portfolio").json()
    assert before[0]["open_ticket_count"] == 0

    res = client_factory(pm_user).post(
        f"/properties/{prop.id}/maintenance-tickets",
        json={"title": "Leaking pipe in unit 4B", "priority": "high"},
    )
    assert res.status_code == 201
    assert res.json()["status"] == "open"

    after = client_factory(owner).get("/owner/portfolio").json()
    assert after[0]["open_ticket_count"] == 1


def test_closing_ticket_via_api_clears_portfolio_badge_count(
    db_session, company_a, pm_user, client_factory
):
    prop = make_property(db_session, company_a, pm_user.username)
    assign_pm(db_session, prop, pm_user.username)
    owner = make_owner(db_session, company_a)

    ticket = client_factory(pm_user).post(
        f"/properties/{prop.id}/maintenance-tickets",
        json={"title": "Broken AC"},
    ).json()

    mid = client_factory(owner).get("/owner/portfolio").json()
    assert mid[0]["open_ticket_count"] == 1

    pm_client = client_factory(pm_user)
    for status in ("pm_review", "quote_requested", "quote_received", "pending_owner_approval"):
        assert pm_client.post(f"/tickets/{ticket['id']}/transition", json={"new_status": status}).status_code == 200

    approve = client_factory(owner).post(
        f"/tickets/{ticket['id']}/transition", json={"new_status": "approved"},
    )
    assert approve.status_code == 200

    for status in ("in_progress", "completed", "closed"):
        assert pm_client.post(f"/tickets/{ticket['id']}/transition", json={"new_status": status}).status_code == 200

    after = client_factory(owner).get("/owner/portfolio").json()
    assert after[0]["open_ticket_count"] == 0


def test_in_progress_ticket_still_counts_as_open(
    db_session, company_a, pm_user, client_factory
):
    prop = make_property(db_session, company_a, pm_user.username)
    assign_pm(db_session, prop, pm_user.username)
    owner = make_owner(db_session, company_a)

    ticket = client_factory(pm_user).post(
        f"/properties/{prop.id}/maintenance-tickets",
        json={"title": "Elevator inspection"},
    ).json()
    pm_client = client_factory(pm_user)
    for status in ("pm_review", "quote_requested", "quote_received", "pending_owner_approval"):
        assert pm_client.post(f"/tickets/{ticket['id']}/transition", json={"new_status": status}).status_code == 200

    approve = client_factory(owner).post(
        f"/tickets/{ticket['id']}/transition", json={"new_status": "approved"},
    )
    assert approve.status_code == 200

    assert pm_client.post(f"/tickets/{ticket['id']}/transition", json={"new_status": "in_progress"}).status_code == 200

    portfolio = client_factory(owner).get("/owner/portfolio").json()
    assert portfolio[0]["open_ticket_count"] == 1


def test_rejected_ticket_does_not_count_as_open(
    db_session, company_a, pm_user, client_factory
):
    # Regression test: "rejected" is a terminal state (see ticket_states.py),
    # same as "closed" -- neither has work pending. open_ticket_count used to
    # only exclude "closed", so a rejected ticket still lit up the portfolio
    # badge and showed up under the "active" ticket filter.
    prop = make_property(db_session, company_a, pm_user.username)
    assign_pm(db_session, prop, pm_user.username)
    owner = make_owner(db_session, company_a)

    ticket = client_factory(pm_user).post(
        f"/properties/{prop.id}/maintenance-tickets",
        json={"title": "Squirrel in the attic"},
    ).json()

    pm_client = client_factory(pm_user)
    for status in ("pm_review", "quote_requested", "quote_received", "pending_owner_approval"):
        assert pm_client.post(f"/tickets/{ticket['id']}/transition", json={"new_status": status}).status_code == 200

    reject = client_factory(owner).post(
        f"/tickets/{ticket['id']}/transition", json={"new_status": "rejected"},
    )
    assert reject.status_code == 200

    portfolio = client_factory(owner).get("/owner/portfolio").json()
    assert portfolio[0]["open_ticket_count"] == 0

    active_tickets = client_factory(owner).get(
        "/owner/tickets", params={"status": "active", "property_id": prop.id}
    ).json()
    assert active_tickets["tickets"] == []