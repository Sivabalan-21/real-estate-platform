"""Day 24 ticket lifecycle and authorization coverage — full Open -> PM
Review -> Quote Requested -> Quote Received -> Pending Owner Approval ->
Approved -> In Progress -> Completed -> Closed workflow, split by role."""
import uuid

from models import Property, PropertyAssignment, User
from rbac import ROLE_OWNER, ROLE_PROPERTY_MANAGER, ROLE_TENANT


def make_pm(db_session, company, username="pm_day24"):
    user = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
                role=ROLE_PROPERTY_MANAGER, company_id=company.id, status="active")
    db_session.add(user)
    db_session.commit()
    return user


def make_tenant(db_session, company, username="tenant_day24"):
    user = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
                role=ROLE_TENANT, company_id=company.id, status="active")
    db_session.add(user)
    db_session.commit()
    return user


def make_owner(db_session, company, username="owner_day24"):
    user = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
                role=ROLE_OWNER, company_id=company.id, status="active")
    db_session.add(user)
    db_session.commit()
    return user


def make_property(db_session, company):
    prop = Property(id=str(uuid.uuid4()), company_id=company.id, name="Day 24 Tower", total_units=5)
    db_session.add(prop)
    db_session.commit()
    return prop


def assign_pm(db_session, prop, pm):
    db_session.add(PropertyAssignment(
        id=str(uuid.uuid4()), property_id=prop.id, pm_username=pm.username,
    ))
    db_session.commit()


def make_ticket(client_factory, tenant, prop):
    response = client_factory(tenant).post(
        "/tickets", json={"property_id": prop.id, "category": "Plumbing"},
    )
    assert response.status_code == 201
    return response.json()


def advance_to_pending_owner_approval(client, ticket_id):
    """Drive a fresh ticket through the PM-owned portion of the lifecycle,
    up to (but not including) the owner's approve/reject decision."""
    for status in ("pm_review", "quote_requested", "quote_received", "pending_owner_approval"):
        response = client.post(f"/tickets/{ticket_id}/transition", json={"new_status": status})
        assert response.status_code == 200


def test_pm_transitions_open_to_pm_review_and_records_history(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    tenant = make_tenant(db_session, company_a)
    prop = make_property(db_session, company_a)
    assign_pm(db_session, prop, pm)
    ticket = make_ticket(client_factory, tenant, prop)

    response = client_factory(pm).post(
        f"/tickets/{ticket['id']}/transition", json={"new_status": "pm_review", "note": "Looking into it"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "pm_review"
    assert [(h["from_status"], h["to_status"]) for h in body["history"]] == [
        (None, "open"), ("open", "pm_review"),
    ]
    assert body["history"][-1]["changed_by"] == pm.username
    assert body["history"][-1]["note"] == "Looking into it"


def test_full_lifecycle_reaches_closed_with_complete_chronological_history(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    tenant = make_tenant(db_session, company_a)
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    assign_pm(db_session, prop, pm)
    ticket = make_ticket(client_factory, tenant, prop)

    pm_client = client_factory(pm)
    advance_to_pending_owner_approval(pm_client, ticket["id"])

    approve = client_factory(owner).post(
        f"/tickets/{ticket['id']}/transition", json={"new_status": "approved", "note": "Approved by owner"},
    )
    assert approve.status_code == 200

    for status in ("in_progress", "completed", "closed"):
        response = pm_client.post(f"/tickets/{ticket['id']}/transition", json={"new_status": status})
        assert response.status_code == 200

    detail = pm_client.get(f"/tickets/{ticket['id']}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["status"] == "closed"
    assert body["closed_at"] is not None
    assert [(h["from_status"], h["to_status"]) for h in body["history"]] == [
        (None, "open"),
        ("open", "pm_review"),
        ("pm_review", "quote_requested"),
        ("quote_requested", "quote_received"),
        ("quote_received", "pending_owner_approval"),
        ("pending_owner_approval", "approved"),
        ("approved", "in_progress"),
        ("in_progress", "completed"),
        ("completed", "closed"),
    ]
    assert body["history"][5]["changed_by"] == owner.username


def test_owner_can_reject_a_pending_ticket(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    tenant = make_tenant(db_session, company_a)
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    assign_pm(db_session, prop, pm)
    ticket = make_ticket(client_factory, tenant, prop)

    advance_to_pending_owner_approval(client_factory(pm), ticket["id"])

    reject = client_factory(owner).post(
        f"/tickets/{ticket['id']}/transition", json={"new_status": "rejected"},
    )
    assert reject.status_code == 200
    assert reject.json()["status"] == "rejected"

    # Rejected is terminal — no role can move it further.
    stuck = client_factory(pm).post(f"/tickets/{ticket['id']}/transition", json={"new_status": "in_progress"})
    assert stuck.status_code == 400
    assert stuck.json()["detail"] == "Transition not allowed for role"


def test_pm_cannot_skip_steps(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    tenant = make_tenant(db_session, company_a)
    prop = make_property(db_session, company_a)
    assign_pm(db_session, prop, pm)
    ticket = make_ticket(client_factory, tenant, prop)
    client = client_factory(pm)

    skip = client.post(f"/tickets/{ticket['id']}/transition", json={"new_status": "approved"})
    assert skip.status_code == 400
    assert skip.json()["detail"] == "Transition not allowed for role"

    # PM also can't jump straight into the owner's own decision.
    assert client.post(f"/tickets/{ticket['id']}/transition", json={"new_status": "pm_review"}).status_code == 200
    skip_to_owner_step = client.post(f"/tickets/{ticket['id']}/transition", json={"new_status": "pending_owner_approval"})
    assert skip_to_owner_step.status_code == 400
    assert skip_to_owner_step.json()["detail"] == "Transition not allowed for role"


def test_closed_ticket_cannot_be_reopened(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    tenant = make_tenant(db_session, company_a)
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    assign_pm(db_session, prop, pm)
    ticket = make_ticket(client_factory, tenant, prop)

    pm_client = client_factory(pm)
    advance_to_pending_owner_approval(pm_client, ticket["id"])
    client_factory(owner).post(f"/tickets/{ticket['id']}/transition", json={"new_status": "approved"})
    for status in ("in_progress", "completed", "closed"):
        pm_client.post(f"/tickets/{ticket['id']}/transition", json={"new_status": status})

    reopen = pm_client.post(f"/tickets/{ticket['id']}/transition", json={"new_status": "in_progress"})
    assert reopen.status_code == 400
    assert reopen.json()["detail"] == "Transition not allowed for role"


def test_tenant_cannot_transition_ticket(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    tenant = make_tenant(db_session, company_a)
    prop = make_property(db_session, company_a)
    assign_pm(db_session, prop, pm)
    ticket = make_ticket(client_factory, tenant, prop)
    response = client_factory(tenant).post(f"/tickets/{ticket['id']}/transition", json={"new_status": "pm_review"})
    assert response.status_code == 403


def test_owner_cannot_make_a_pm_only_transition(db_session, company_a, client_factory):
    """Owner's only legal move is deciding a pending-approval ticket — every
    other stage of the lifecycle belongs to the PM."""
    pm = make_pm(db_session, company_a)
    tenant = make_tenant(db_session, company_a)
    owner = make_owner(db_session, company_a)
    prop = make_property(db_session, company_a)
    assign_pm(db_session, prop, pm)
    ticket = make_ticket(client_factory, tenant, prop)

    pm_client = client_factory(pm)
    advance_to_pending_owner_approval(pm_client, ticket["id"])
    client_factory(owner).post(f"/tickets/{ticket['id']}/transition", json={"new_status": "approved"})
    pm_client.post(f"/tickets/{ticket['id']}/transition", json={"new_status": "in_progress"})

    response = client_factory(owner).post(f"/tickets/{ticket['id']}/transition", json={"new_status": "closed"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Transition not allowed for role"


def test_pm_cannot_transition_unassigned_or_cross_company_ticket(db_session, company_a, company_b, client_factory):
    pm_a = make_pm(db_session, company_a, "pm_a_day24")
    tenant_a = make_tenant(db_session, company_a, "tenant_a_day24")
    prop_a = make_property(db_session, company_a)
    ticket_a = make_ticket(client_factory, tenant_a, prop_a)
    assert client_factory(pm_a).post(f"/tickets/{ticket_a['id']}/transition", json={"new_status": "pm_review"}).status_code == 403

    pm_b = make_pm(db_session, company_b, "pm_b_day24")
    assert client_factory(pm_b).post(f"/tickets/{ticket_a['id']}/transition", json={"new_status": "pm_review"}).status_code == 403


def test_legacy_put_and_pm_patch_cannot_bypass_state_machine(db_session, company_a, client_factory):
    pm = make_pm(db_session, company_a)
    tenant = make_tenant(db_session, company_a)
    prop = make_property(db_session, company_a)
    assign_pm(db_session, prop, pm)
    ticket = make_ticket(client_factory, tenant, prop)
    client = client_factory(pm)

    put = client.put(f"/maintenance-tickets/{ticket['id']}", json={"status": "closed"})
    assert put.status_code == 400
    assert put.json()["detail"] == "Transition not allowed for role"

    patch = client.patch(f"/pm/tickets/{ticket['id']}", json={"status": "quote_requested"})
    assert patch.status_code == 400
    assert patch.json()["detail"] == "Transition not allowed for role"

    valid_put = client.put(f"/maintenance-tickets/{ticket['id']}", json={"status": "pm_review"})
    assert valid_put.status_code == 200
    valid_patch = client.patch(f"/pm/tickets/{ticket['id']}", json={"status": "quote_requested"})
    assert valid_patch.status_code == 200


def test_tenant_history_omits_internal_audit_fields(db_session, company_a, client_factory):
    """GET /tickets/:id must not leak changed_by/note to a tenant, even
    though the PM-facing view (and the transition response) includes them."""
    pm = make_pm(db_session, company_a)
    tenant = make_tenant(db_session, company_a)
    prop = make_property(db_session, company_a)
    assign_pm(db_session, prop, pm)
    ticket = make_ticket(client_factory, tenant, prop)

    client_factory(pm).post(
        f"/tickets/{ticket['id']}/transition",
        json={"new_status": "pm_review", "note": "internal PM note"},
    )

    tenant_view = client_factory(tenant).get(f"/tickets/{ticket['id']}")
    assert tenant_view.status_code == 200
    for row in tenant_view.json()["history"]:
        assert "changed_by" not in row
        assert "note" not in row

    pm_view = client_factory(pm).get(f"/tickets/{ticket['id']}")
    assert any(row.get("note") == "internal PM note" for row in pm_view.json()["history"])