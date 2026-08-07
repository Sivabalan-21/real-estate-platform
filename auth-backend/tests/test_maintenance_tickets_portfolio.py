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

from models import Property, User
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


def test_creating_ticket_via_api_raises_portfolio_badge_count(
    db_session, company_a, pm_user, client_factory
):
    prop = make_property(db_session, company_a, pm_user.username)
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
    owner = make_owner(db_session, company_a)

    ticket = client_factory(pm_user).post(
        f"/properties/{prop.id}/maintenance-tickets",
        json={"title": "Broken AC"},
    ).json()

    mid = client_factory(owner).get("/owner/portfolio").json()
    assert mid[0]["open_ticket_count"] == 1

    close_res = client_factory(pm_user).put(
        f"/maintenance-tickets/{ticket['id']}",
        json={"status": "closed"},
    )
    assert close_res.status_code == 200
    assert close_res.json()["status"] == "closed"

    after = client_factory(owner).get("/owner/portfolio").json()
    assert after[0]["open_ticket_count"] == 0


def test_in_progress_ticket_still_counts_as_open(
    db_session, company_a, pm_user, client_factory
):
    prop = make_property(db_session, company_a, pm_user.username)
    owner = make_owner(db_session, company_a)

    ticket = client_factory(pm_user).post(
        f"/properties/{prop.id}/maintenance-tickets",
        json={"title": "Elevator inspection"},
    ).json()
    client_factory(pm_user).put(f"/maintenance-tickets/{ticket['id']}", json={"status": "in_progress"})

    portfolio = client_factory(owner).get("/owner/portfolio").json()
    assert portfolio[0]["open_ticket_count"] == 1


def test_multiple_open_tickets_show_correct_count(
    db_session, company_a, pm_user, client_factory
):
    prop = make_property(db_session, company_a, pm_user.username)
    owner = make_owner(db_session, company_a)

    for title in ["Broken window", "Noisy AC unit"]:
        res = client_factory(pm_user).post(
            f"/properties/{prop.id}/maintenance-tickets",
            json={"title": title},
        )
        assert res.status_code == 201

    portfolio = client_factory(owner).get("/owner/portfolio").json()
    assert portfolio[0]["open_ticket_count"] == 2