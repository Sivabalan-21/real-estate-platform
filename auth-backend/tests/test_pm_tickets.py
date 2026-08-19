"""
PM ticket list & detail view (Day 17).

Covers:
- PM sees tickets from all their assigned properties, not just one.
- status/property_id filters narrow the result set correctly.
- Company isolation: a PM from Company B can't see Company A's tickets.
- Status update via PATCH persists (and is reflected on reload / re-fetch).
- Ticket detail includes tenant info and attachments.

Run with:  pytest tests/test_pm_tickets.py -v
"""
import uuid

from models import User, Property, Unit, MaintenanceTicket, TicketAttachment, PropertyAssignment
from rbac import ROLE_TENANT, ROLE_PROPERTY_MANAGER


def make_pm(db_session, company, username="pm_day17"):
    pm = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
              role=ROLE_PROPERTY_MANAGER, company_id=company.id, status="active")
    db_session.add(pm)
    db_session.commit()
    return pm


def make_tenant(db_session, company, username):
    t = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
             full_name=username.title(), phone="555-0100",
             role=ROLE_TENANT, company_id=company.id, status="active")
    db_session.add(t)
    db_session.commit()
    return t


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


def assign_pm(db_session, property_, pm_username):
    a = PropertyAssignment(id=str(uuid.uuid4()), property_id=property_.id, pm_username=pm_username)
    db_session.add(a)
    db_session.commit()
    return a


def make_ticket(db_session, company, property_, unit, created_by, status="open", title="Leaky faucet"):
    t = MaintenanceTicket(id=str(uuid.uuid4()), company_id=company.id, property_id=property_.id,
                           unit_id=unit.id, title=title, status=status, created_by=created_by)
    db_session.add(t)
    db_session.commit()
    return t


def test_pm_sees_tickets_across_all_assigned_properties(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    prop1 = make_property(db_session, company_a, "Tower 1")
    prop2 = make_property(db_session, company_a, "Tower 2")
    unit1 = make_unit(db_session, prop1, "1-A")
    unit2 = make_unit(db_session, prop2, "2-A")
    assign_pm(db_session, prop1, pm.username)
    assign_pm(db_session, prop2, pm.username)
    make_ticket(db_session, company_a, prop1, unit1, "tenant1", title="Tower 1 issue")
    make_ticket(db_session, company_a, prop2, unit2, "tenant2", title="Tower 2 issue")

    res = client_factory(pm).get("/pm/tickets")
    assert res.status_code == 200
    titles = {t["title"] for t in res.json()}
    assert titles == {"Tower 1 issue", "Tower 2 issue"}


def test_pm_does_not_see_tickets_from_unassigned_property(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    assigned_prop = make_property(db_session, company_a, "Assigned Tower")
    other_prop = make_property(db_session, company_a, "Someone Else's Tower")
    unit_a = make_unit(db_session, assigned_prop, "A-1")
    unit_o = make_unit(db_session, other_prop, "O-1")
    assign_pm(db_session, assigned_prop, pm.username)
    make_ticket(db_session, company_a, assigned_prop, unit_a, "tenant1", title="Visible")
    make_ticket(db_session, company_a, other_prop, unit_o, "tenant2", title="Hidden")

    res = client_factory(pm).get("/pm/tickets")
    titles = {t["title"] for t in res.json()}
    assert titles == {"Visible"}


def test_filter_by_status_open(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    assign_pm(db_session, prop, pm.username)
    make_ticket(db_session, company_a, prop, unit, "tenant1", status="open", title="Open ticket")
    make_ticket(db_session, company_a, prop, unit, "tenant1", status="closed", title="Closed ticket")

    res = client_factory(pm).get("/pm/tickets", params={"status": "open"})
    assert res.status_code == 200
    titles = {t["title"] for t in res.json()}
    assert titles == {"Open ticket"}


def test_filter_by_property_id(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    prop1 = make_property(db_session, company_a, "Tower 1")
    prop2 = make_property(db_session, company_a, "Tower 2")
    unit1 = make_unit(db_session, prop1, "1-A")
    unit2 = make_unit(db_session, prop2, "2-A")
    assign_pm(db_session, prop1, pm.username)
    assign_pm(db_session, prop2, pm.username)
    make_ticket(db_session, company_a, prop1, unit1, "tenant1", title="Tower 1 issue")
    make_ticket(db_session, company_a, prop2, unit2, "tenant2", title="Tower 2 issue")

    res = client_factory(pm).get("/pm/tickets", params={"property_id": prop1.id})
    assert res.status_code == 200
    titles = {t["title"] for t in res.json()}
    assert titles == {"Tower 1 issue"}


def test_company_isolation(db_session, company_a, company_b, client_factory):
    pm_a = make_pm(db_session, company_a, "pm_a")
    prop_a = make_property(db_session, company_a, "Company A Tower")
    unit_a = make_unit(db_session, prop_a)
    assign_pm(db_session, prop_a, pm_a.username)
    make_ticket(db_session, company_a, prop_a, unit_a, "tenant_a", title="Company A ticket")

    pm_b = make_pm(db_session, company_b, "pm_b")
    prop_b = make_property(db_session, company_b, "Company B Tower")
    unit_b = make_unit(db_session, prop_b)
    assign_pm(db_session, prop_b, pm_b.username)
    make_ticket(db_session, company_b, prop_b, unit_b, "tenant_b", title="Company B ticket")

    res_a = client_factory(pm_a).get("/pm/tickets")
    res_b = client_factory(pm_b).get("/pm/tickets")

    assert {t["title"] for t in res_a.json()} == {"Company A ticket"}
    assert {t["title"] for t in res_b.json()} == {"Company B ticket"}


def test_pm_cannot_access_ticket_outside_assigned_properties(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    other_prop = make_property(db_session, company_a, "Not Mine")
    unit = make_unit(db_session, other_prop)
    ticket = make_ticket(db_session, company_a, other_prop, unit, "tenant1")
    # Deliberately no PropertyAssignment for this PM on other_prop.

    res = client_factory(pm).get(f"/pm/tickets/{ticket.id}")
    assert res.status_code == 403


def test_status_update_persists(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    assign_pm(db_session, prop, pm.username)
    ticket = make_ticket(db_session, company_a, prop, unit, "tenant1", status="open")

    client = client_factory(pm)
    patch_res = client.patch(f"/pm/tickets/{ticket.id}", json={"status": "in_progress"})
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "in_progress"

    # Simulate a page reload: fetch again from scratch.
    reload_res = client.get(f"/pm/tickets/{ticket.id}")
    assert reload_res.status_code == 200
    assert reload_res.json()["status"] == "in_progress"


def test_status_update_open_to_in_review_persists(db_session, company_a, client_factory):
    """The literal Day 17 acceptance criterion: 'PM updates status from
    Open to In Review -> change persists after page reload.' Distinct from
    test_status_update_persists above (which used in_progress) because
    in_review wasn't a valid TICKET_STATUSES value until this fix."""
    pm = make_pm(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    assign_pm(db_session, prop, pm.username)
    ticket = make_ticket(db_session, company_a, prop, unit, "tenant1", status="open")

    client = client_factory(pm)
    patch_res = client.patch(f"/pm/tickets/{ticket.id}", json={"status": "in_review"})
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "in_review"

    reload_res = client.get(f"/pm/tickets/{ticket.id}")
    assert reload_res.status_code == 200
    assert reload_res.json()["status"] == "in_review"


def test_status_update_scheduled_is_valid(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    assign_pm(db_session, prop, pm.username)
    ticket = make_ticket(db_session, company_a, prop, unit, "tenant1", status="open")

    client = client_factory(pm)
    res = client.patch(f"/pm/tickets/{ticket.id}", json={"status": "scheduled"})
    assert res.status_code == 200
    assert res.json()["status"] == "scheduled"


def test_pm_can_add_note(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    assign_pm(db_session, prop, pm.username)
    ticket = make_ticket(db_session, company_a, prop, unit, "tenant1")

    client = client_factory(pm)
    res = client.patch(f"/pm/tickets/{ticket.id}", json={"pm_notes": "Called tenant, scheduling plumber for Thursday."})
    assert res.status_code == 200
    assert res.json()["pm_notes"] == "Called tenant, scheduling plumber for Thursday."

    reload_res = client.get(f"/pm/tickets/{ticket.id}")
    assert reload_res.json()["pm_notes"] == "Called tenant, scheduling plumber for Thursday."


def test_ticket_detail_includes_tenant_info_and_photos(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    tenant = make_tenant(db_session, company_a, "photo_tenant")
    prop = make_property(db_session, company_a)
    unit = make_unit(db_session, prop)
    assign_pm(db_session, prop, pm.username)
    ticket = make_ticket(db_session, company_a, prop, unit, tenant.username)

    for i in range(3):
        db_session.add(TicketAttachment(
            id=str(uuid.uuid4()), ticket_id=ticket.id, url=f"/uploads/photo{i}.jpg",
            filename=f"photo{i}.jpg", type="photo", uploaded_by=tenant.username,
        ))
    db_session.commit()

    res = client_factory(pm).get(f"/pm/tickets/{ticket.id}")
    assert res.status_code == 200
    body = res.json()
    assert body["tenant"]["username"] == tenant.username
    assert body["tenant"]["full_name"] == tenant.full_name
    assert len(body["attachments"]) == 3


def test_invalid_status_filter_rejected(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    res = client_factory(pm).get("/pm/tickets", params={"status": "not_a_real_status"})
    assert res.status_code == 400


def test_non_pm_role_forbidden(db_session, company_a, admin_user, client_factory):
    res = client_factory(admin_user).get("/pm/tickets")
    assert res.status_code == 403