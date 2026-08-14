"""
Maintenance ticket model & migration (Day 14).

Covers the new POST /tickets, GET /tickets/{id}, and
GET /properties/{id}/tickets routes added on top of the Day 10
MaintenanceTicket model -- company isolation, TicketHistory auto-creation,
and the new company_id/category/assigned_pm/rating fields. The Day 10
routes and tests (test_maintenance_tickets_portfolio.py) are left alone
and keep passing unchanged.

Run with:  pytest tests/test_tickets_day14.py -v
"""
import uuid

from models import Property, TicketHistory, User
from rbac import ROLE_TENANT


def make_property(db_session, company, created_by, name="Test Tower"):
    p = Property(id=str(uuid.uuid4()), company_id=company.id, name=name,
                 created_by=created_by, total_units=5)
    db_session.add(p)
    db_session.commit()
    return p


def make_tenant(db_session, company, username="tenant_a"):
    t = User(id=str(uuid.uuid4()), username=username, email=f"{username}@example.com",
             role=ROLE_TENANT, company_id=company.id, status="active")
    db_session.add(t)
    db_session.commit()
    return t


def test_post_tickets_as_tenant_creates_open_ticket_with_company_id(
    db_session, company_a, pm_user, client_factory
):
    prop = make_property(db_session, company_a, pm_user.username)
    tenant = make_tenant(db_session, company_a)

    res = client_factory(tenant).post(
        "/tickets",
        json={"property_id": prop.id, "category": "Plumbing", "description": "Leaking tap"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["status"] == "open"
    assert body["raised_by"] == tenant.username
    assert body["company_id"] == company_a.id
    assert body["category"] == "Plumbing"


def test_get_ticket_cross_company_returns_403(
    db_session, company_a, company_b, pm_user, client_factory
):
    prop = make_property(db_session, company_a, pm_user.username)
    tenant_a = make_tenant(db_session, company_a)
    tenant_b = make_tenant(db_session, company_b, username="tenant_b")

    ticket = client_factory(tenant_a).post(
        "/tickets", json={"property_id": prop.id, "category": "Electrical"},
    ).json()

    res = client_factory(tenant_b).get(f"/tickets/{ticket['id']}")
    assert res.status_code == 403


def test_get_property_tickets_returns_only_that_propertys_tickets(
    db_session, company_a, pm_user, client_factory
):
    prop_1 = make_property(db_session, company_a, pm_user.username, name="Tower 1")
    prop_2 = make_property(db_session, company_a, pm_user.username, name="Tower 2")
    tenant = make_tenant(db_session, company_a)

    client_factory(tenant).post("/tickets", json={"property_id": prop_1.id, "category": "HVAC"})
    client_factory(tenant).post("/tickets", json={"property_id": prop_2.id, "category": "Roof"})

    res = client_factory(pm_user).get(f"/properties/{prop_1.id}/tickets")
    assert res.status_code == 200
    tickets = res.json()
    assert len(tickets) == 1
    assert tickets[0]["property_id"] == prop_1.id


def test_ticket_history_row_created_on_ticket_creation(
    db_session, company_a, pm_user, client_factory
):
    prop = make_property(db_session, company_a, pm_user.username)
    tenant = make_tenant(db_session, company_a)

    ticket = client_factory(tenant).post(
        "/tickets", json={"property_id": prop.id, "category": "Pest"},
    ).json()

    history = db_session.query(TicketHistory).filter(TicketHistory.ticket_id == ticket["id"]).all()
    assert len(history) == 1
    assert history[0].from_status is None
    assert history[0].to_status == "open"


def test_ticket_history_row_created_on_status_change_via_existing_put_route(
    db_session, company_a, pm_user, client_factory
):
    prop = make_property(db_session, company_a, pm_user.username)
    tenant = make_tenant(db_session, company_a)

    ticket = client_factory(tenant).post(
        "/tickets", json={"property_id": prop.id, "category": "Appliance"},
    ).json()

    client_factory(pm_user).put(f"/maintenance-tickets/{ticket['id']}", json={"status": "closed"})

    history = db_session.query(TicketHistory).filter(TicketHistory.ticket_id == ticket["id"]).order_by(
        TicketHistory.created_at
    ).all()
    assert len(history) == 2
    assert history[1].from_status == "open"
    assert history[1].to_status == "closed"


# ---- Day 15: tenant maintenance request creation, with photo attachments ----

def _fake_png_bytes():
    # Minimal valid 1x1 PNG so content-type/size checks pass.
    import base64
    return base64.b64decode(
        b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )


def test_submit_ticket_no_photos_creates_ticket(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, pm_user.username)
    tenant = make_tenant(db_session, company_a)

    res = client_factory(tenant).post(
        "/tickets", json={"property_id": prop.id, "category": "Plumbing", "description": "Burst pipe"},
    )
    assert res.status_code == 201
    assert res.json()["status"] == "open"


def test_submit_ticket_with_three_photos_links_three_attachments(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, pm_user.username)
    tenant = make_tenant(db_session, company_a)
    client = client_factory(tenant)

    ticket = client.post(
        "/tickets", json={"property_id": prop.id, "category": "Electrical", "description": "Sparking outlet"},
    ).json()

    png = _fake_png_bytes()
    files = [("files", (f"photo{i}.png", png, "image/png")) for i in range(3)]
    res = client.post(f"/tickets/{ticket['id']}/attachments", files=files)
    assert res.status_code == 201
    attachments = res.json()
    assert len(attachments) == 3
    assert all(a["type"] == "photo" for a in attachments)

    get_res = client.get(f"/tickets/{ticket['id']}")
    assert len(get_res.json()["attachments"]) == 3


def test_submit_ticket_missing_category_returns_error(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, pm_user.username)
    tenant = make_tenant(db_session, company_a)

    # category omitted entirely -> FastAPI/Pydantic validation error
    res = client_factory(tenant).post("/tickets", json={"property_id": prop.id, "description": "no category"})
    assert res.status_code == 422


def test_ticket_visible_in_pm_property_tickets_immediately_after_submit(
    db_session, company_a, pm_user, client_factory
):
    prop = make_property(db_session, company_a, pm_user.username)
    tenant = make_tenant(db_session, company_a)

    client_factory(tenant).post(
        "/tickets", json={"property_id": prop.id, "category": "Roof", "description": "Leak in ceiling"},
    )

    res = client_factory(pm_user).get(f"/properties/{prop.id}/tickets")
    assert res.status_code == 200
    tickets = res.json()
    assert len(tickets) == 1
    assert tickets[0]["category"] == "Roof"


# ---- Day 16: GET /tenant/tickets, self-scoped to the logged-in tenant ----

def test_tenant_with_three_tickets_sees_all_three_newest_first(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, pm_user.username)
    tenant = make_tenant(db_session, company_a)
    client = client_factory(tenant)

    ids_in_order = []
    for cat in ("Plumbing", "Electrical", "HVAC"):
        t = client.post("/tickets", json={"property_id": prop.id, "category": cat}).json()
        ids_in_order.append(t["id"])

    res = client.get("/tenant/tickets")
    assert res.status_code == 200
    tickets = res.json()
    assert len(tickets) == 3
    # newest first == reverse creation order
    assert [t["id"] for t in tickets] == list(reversed(ids_in_order))


def test_tenant_tickets_excludes_other_tenants_tickets(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, pm_user.username)
    tenant_a = make_tenant(db_session, company_a, username="tenant_owns_this")
    tenant_b = make_tenant(db_session, company_a, username="tenant_other")

    client_factory(tenant_a).post("/tickets", json={"property_id": prop.id, "category": "Plumbing"})
    client_factory(tenant_b).post("/tickets", json={"property_id": prop.id, "category": "Electrical"})

    res = client_factory(tenant_a).get("/tenant/tickets")
    tickets = res.json()
    assert len(tickets) == 1
    assert tickets[0]["category"] == "Plumbing"
    assert tickets[0]["raised_by"] == "tenant_owns_this"


def test_tenant_tickets_forbidden_for_non_tenant_role(db_session, company_a, pm_user, client_factory):
    res = client_factory(pm_user).get("/tenant/tickets")
    assert res.status_code == 403