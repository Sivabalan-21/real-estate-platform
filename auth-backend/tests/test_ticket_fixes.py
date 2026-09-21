import uuid
from models import User, Property, Unit, MaintenanceTicket, PropertyAssignment, Lease
from rbac import ROLE_PROPERTY_MANAGER
from ticket_states import TICKET_STATE_LABELS

def make_pm(db_session, company, username="pm2"):
    pm = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
              role=ROLE_PROPERTY_MANAGER, company_id=company.id, status="active")
    db_session.add(pm); db_session.commit()
    return pm

def test_closing_last_ticket_releases_unit_from_maintenance(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    prop = Property(id=str(uuid.uuid4()), company_id=company_a.id, name="Maple Tower", total_units=4)
    db_session.add(prop); db_session.commit()
    unit = Unit(id=str(uuid.uuid4()), property_id=prop.id, unit_number="204", type="1BR", status="maintenance")
    db_session.add(unit); db_session.commit()
    db_session.add(PropertyAssignment(id=str(uuid.uuid4()), property_id=prop.id, pm_username=pm.username))
    ticket = MaintenanceTicket(id=str(uuid.uuid4()), company_id=company_a.id, property_id=prop.id,
                                unit_id=unit.id, title="Pest sighting", status="completed", created_by=pm.username)
    db_session.add(ticket); db_session.commit()

    client = client_factory(pm)
    res = client.post(f"/tickets/{ticket.id}/transition", json={"new_status": "closed", "note": "done"})
    assert res.status_code == 200, res.text

    db_session.refresh(unit)
    assert unit.status == "vacant", f"unit should leave maintenance once closed, got {unit.status!r}"

def test_pm_ticket_history_survives_reload(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a, "pm3")
    prop = Property(id=str(uuid.uuid4()), company_id=company_a.id, name="Oak Residences", total_units=4)
    db_session.add(prop); db_session.commit()
    unit = Unit(id=str(uuid.uuid4()), property_id=prop.id, unit_number="102", type="1BR", status="maintenance")
    db_session.add(unit); db_session.commit()
    db_session.add(PropertyAssignment(id=str(uuid.uuid4()), property_id=prop.id, pm_username=pm.username))
    ticket = MaintenanceTicket(id=str(uuid.uuid4()), company_id=company_a.id, property_id=prop.id,
                                unit_id=unit.id, title="Leaking faucet", status="completed", created_by=pm.username)
    db_session.add(ticket); db_session.commit()

    client = client_factory(pm)
    transition_res = client.post(f"/tickets/{ticket.id}/transition", json={"new_status": "closed", "note": "fixed"})
    assert transition_res.status_code == 200
    fresh_hist = transition_res.json()["history"]
    assert fresh_hist[-1]["changed_by"] == "pm3"
    assert fresh_hist[-1]["to_status"] == "closed"

    # Simulate navigating away and back in: a plain GET should return the
    # same rich history, not the stripped-down tenant feed.
    reload_res = client.get(f"/pm/tickets/{ticket.id}")
    assert reload_res.status_code == 200
    reload_hist = reload_res.json()["history"]
    assert reload_hist[-1]["changed_by"] == "pm3", reload_hist[-1]
    assert reload_hist[-1]["to_status"] == "closed", reload_hist[-1]
    assert reload_hist == fresh_hist