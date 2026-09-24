"""Unit status <-> maintenance ticket sync.

Before this, Unit.status ("vacant" / "occupied" / "maintenance") was only
ever changed by a PM manually editing a unit in Property Management -- it
had no connection to MaintenanceTicket rows at all. That meant a unit could
sit flagged "maintenance" (shown to Owners as "Under Repair") forever after
its ticket was closed or rejected, because nothing ever told it to revert.

This file covers the fix: opening a ticket against a unit puts the unit
into "maintenance"; resolving the ticket (closed or rejected) restores it
-- but only once every open ticket on that unit is resolved, without
clobbering a status a PM set by hand with no ticket behind it, and based on
the unit's *current* lease rather than a stale snapshot of its prior status
(a snapshot taken when the ticket opened can go stale if the lease changes
while repairs are in progress).

Run with:  pytest tests/test_unit_status_ticket_sync.py -v
"""
import uuid
from datetime import date

from models import Lease, Property, PropertyAssignment, Unit, User
from rbac import ROLE_OWNER, ROLE_PROPERTY_MANAGER


def make_pm(db_session, company, username="pm_sync"):
    pm = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
              role=ROLE_PROPERTY_MANAGER, company_id=company.id, status="active")
    db_session.add(pm)
    db_session.commit()
    return pm


def make_owner(db_session, company, username="owner_sync"):
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


def make_unit(db_session, property_, unit_number="A-101", status="occupied"):
    u = Unit(id=str(uuid.uuid4()), property_id=property_.id, unit_number=unit_number,
              type="2BHK", status=status)
    db_session.add(u)
    db_session.commit()
    return u


def make_active_lease(db_session, property_, unit, tenant_username=None):
    lease = Lease(
        id=str(uuid.uuid4()), property_id=property_.id, unit_id=unit.id,
        tenant_username=tenant_username, start_date=date(2026, 1, 1),
        monthly_rent=1000.0, status="active",
    )
    db_session.add(lease)
    db_session.commit()
    return lease


def assign_pm(db_session, property_, pm_username):
    db_session.add(PropertyAssignment(
        id=str(uuid.uuid4()), property_id=property_.id, pm_username=pm_username,
    ))
    db_session.commit()


def approve_and_finish(pm_client, owner_client, ticket_id, final_status):
    """Walk a ticket through pm_review -> quote_received -> owner approval
    -> final_status ("closed" via in_progress/completed, or "rejected")."""
    for status in ("pm_review", "quote_requested", "quote_received", "pending_owner_approval"):
        assert pm_client.post(f"/tickets/{ticket_id}/transition", json={"new_status": status}).status_code == 200

    if final_status == "rejected":
        res = owner_client.post(f"/tickets/{ticket_id}/transition", json={"new_status": "rejected"})
        assert res.status_code == 200
        return

    assert owner_client.post(f"/tickets/{ticket_id}/transition", json={"new_status": "approved"}).status_code == 200
    for status in ("in_progress", "completed", "closed"):
        assert pm_client.post(f"/tickets/{ticket_id}/transition", json={"new_status": status}).status_code == 200


def test_opening_ticket_flips_unit_to_maintenance(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, pm_user.username)
    assign_pm(db_session, prop, pm_user.username)
    unit = make_unit(db_session, prop, status="occupied")

    res = client_factory(pm_user).post(
        f"/properties/{prop.id}/maintenance-tickets",
        json={"unit_id": unit.id, "title": "Leaking pipe"},
    )
    assert res.status_code == 201

    db_session.refresh(unit)
    assert unit.status == "maintenance"
    assert unit.pre_maintenance_status == "occupied"


def test_closing_ticket_restores_prior_unit_status(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, pm_user.username)
    assign_pm(db_session, prop, pm_user.username)
    owner = make_owner(db_session, company_a)
    unit = make_unit(db_session, prop, status="occupied")
    make_active_lease(db_session, prop, unit)

    ticket = client_factory(pm_user).post(
        f"/properties/{prop.id}/maintenance-tickets",
        json={"unit_id": unit.id, "title": "Leaking pipe"},
    ).json()

    approve_and_finish(client_factory(pm_user), client_factory(owner), ticket["id"], "closed")

    db_session.refresh(unit)
    assert unit.status == "occupied"
    assert unit.pre_maintenance_status is None


def test_rejected_ticket_also_restores_unit_status(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, pm_user.username)
    assign_pm(db_session, prop, pm_user.username)
    owner = make_owner(db_session, company_a)
    unit = make_unit(db_session, prop, status="vacant")

    ticket = client_factory(pm_user).post(
        f"/properties/{prop.id}/maintenance-tickets",
        json={"unit_id": unit.id, "title": "Squirrel in the attic"},
    ).json()

    approve_and_finish(client_factory(pm_user), client_factory(owner), ticket["id"], "rejected")

    db_session.refresh(unit)
    assert unit.status == "vacant"
    assert unit.pre_maintenance_status is None


def test_unit_stays_maintenance_while_a_second_ticket_is_still_open(
    db_session, company_a, pm_user, client_factory
):
    prop = make_property(db_session, company_a, pm_user.username)
    assign_pm(db_session, prop, pm_user.username)
    owner = make_owner(db_session, company_a)
    unit = make_unit(db_session, prop, status="occupied")
    make_active_lease(db_session, prop, unit)

    pm_client = client_factory(pm_user)
    ticket_a = pm_client.post(
        f"/properties/{prop.id}/maintenance-tickets",
        json={"unit_id": unit.id, "title": "Leaking pipe"},
    ).json()
    ticket_b = client_factory(pm_user).post(
        f"/properties/{prop.id}/maintenance-tickets",
        json={"unit_id": unit.id, "title": "Broken window latch"},
    ).json()

    db_session.refresh(unit)
    assert unit.status == "maintenance"
    # Second ticket opening on an already-"maintenance" unit must not
    # overwrite the stored prior status with "maintenance" itself.
    assert unit.pre_maintenance_status == "occupied"

    # Resolve only the first ticket -- the unit should stay under repair
    # because ticket_b is still open.
    approve_and_finish(client_factory(pm_user), client_factory(owner), ticket_a["id"], "closed")
    db_session.refresh(unit)
    assert unit.status == "maintenance"

    # Resolve the second (last remaining) ticket -- now it should revert.
    approve_and_finish(client_factory(pm_user), client_factory(owner), ticket_b["id"], "closed")
    db_session.refresh(unit)
    assert unit.status == "occupied"
    assert unit.pre_maintenance_status is None


def test_closing_ticket_reflects_lease_ended_during_repair(
    db_session, company_a, pm_user, client_factory
):
    # Regression test: the unit was occupied when the ticket opened, but the
    # tenant's lease ends while repairs are in progress. Restoring the old
    # "occupied" snapshot would be wrong here -- the unit must come out of
    # "maintenance" as "vacant" because that's its real state right now.
    prop = make_property(db_session, company_a, pm_user.username)
    assign_pm(db_session, prop, pm_user.username)
    owner = make_owner(db_session, company_a)
    unit = make_unit(db_session, prop, status="occupied")
    lease = make_active_lease(db_session, prop, unit)

    ticket = client_factory(pm_user).post(
        f"/properties/{prop.id}/maintenance-tickets",
        json={"unit_id": unit.id, "title": "Leaking pipe"},
    ).json()

    db_session.refresh(unit)
    assert unit.status == "maintenance"

    lease.status = "ended"
    db_session.add(lease)
    db_session.commit()

    approve_and_finish(client_factory(pm_user), client_factory(owner), ticket["id"], "closed")

    db_session.refresh(unit)
    assert unit.status == "vacant"
    assert unit.pre_maintenance_status is None


def test_manual_maintenance_flag_with_no_ticket_is_left_alone(
    db_session, company_a, pm_user, client_factory
):
    # A unit a PM marked "maintenance" by hand, with no ticket behind it,
    # should be untouched by the sync logic -- opening an unrelated ticket
    # on a *different* unit shouldn't revert it, and there's nothing here
    # for a ticket transition to "resolve" in the first place.
    prop = make_property(db_session, company_a, pm_user.username)
    assign_pm(db_session, prop, pm_user.username)
    manual_unit = make_unit(db_session, prop, unit_number="B-1", status="maintenance")

    other_unit = make_unit(db_session, prop, unit_number="B-2", status="vacant")
    client_factory(pm_user).post(
        f"/properties/{prop.id}/maintenance-tickets",
        json={"unit_id": other_unit.id, "title": "Broken window latch"},
    )

    db_session.refresh(manual_unit)
    assert manual_unit.status == "maintenance"
    assert manual_unit.pre_maintenance_status is None


def test_ticket_with_no_unit_does_not_touch_any_unit_status(
    db_session, company_a, pm_user, client_factory
):
    prop = make_property(db_session, company_a, pm_user.username)
    assign_pm(db_session, prop, pm_user.username)
    owner = make_owner(db_session, company_a)
    unrelated_unit = make_unit(db_session, prop, status="vacant")

    # Property-level ticket, no unit_id.
    ticket = client_factory(pm_user).post(
        f"/properties/{prop.id}/maintenance-tickets",
        json={"title": "Elevator inspection"},
    ).json()
    assert ticket["unit_id"] is None

    approve_and_finish(client_factory(pm_user), client_factory(owner), ticket["id"], "closed")

    db_session.refresh(unrelated_unit)
    assert unrelated_unit.status == "vacant"