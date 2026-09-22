import uuid
import importlib.util
from pathlib import Path

from models import (
    Company,
    MaintenanceTicket,
    Property,
    PropertyAssignment,
    TicketComment,
    Unit,
    User,
)
from rbac import ROLE_OWNER, ROLE_PROPERTY_MANAGER, ROLE_TENANT, ROLE_VENDOR


MIGRATION_PATH = (
    Path(__file__).parents[1]
    / "alembic"
    / "versions"
    / "e7f1a2b3c4d5_create_ticket_comments.py"
)
_migration_spec = importlib.util.spec_from_file_location(
    "ticket_comments_migration", MIGRATION_PATH
)
ticket_comments_migration = importlib.util.module_from_spec(_migration_spec)
_migration_spec.loader.exec_module(ticket_comments_migration)


def make_user(db_session, company, username, role):
    user = User(
        id=str(uuid.uuid4()),
        username=username,
        email=f"{username}@example.com",
        full_name=username.title(),
        role=role,
        company_id=company.id,
        status="active",
    )
    db_session.add(user)
    db_session.commit()
    return user


def make_ticket(db_session, company, pm, tenant):
    prop = Property(
        id=str(uuid.uuid4()),
        company_id=company.id,
        name="Comments Tower",
        total_units=1,
    )
    unit = Unit(
        id=str(uuid.uuid4()),
        property_id=prop.id,
        unit_number="A-101",
        type="1BHK",
        status="occupied",
    )
    db_session.add_all([prop, unit])
    db_session.add(PropertyAssignment(
        id=str(uuid.uuid4()),
        property_id=prop.id,
        pm_username=pm.username,
    ))
    db_session.commit()

    ticket = MaintenanceTicket(
        id=str(uuid.uuid4()),
        company_id=company.id,
        property_id=prop.id,
        unit_id=unit.id,
        title="Leaking tap",
        created_by=tenant.username,
        assigned_pm=pm.username,
    )
    db_session.add(ticket)
    db_session.commit()
    return ticket


def test_tenant_can_create_all_comment_and_it_is_persisted(
    db_session, company_a, client_factory
):
    pm = make_user(db_session, company_a, "comment_pm", ROLE_PROPERTY_MANAGER)
    tenant = make_user(db_session, company_a, "comment_tenant", ROLE_TENANT)
    ticket = make_ticket(db_session, company_a, pm, tenant)

    response = client_factory(tenant).post(
        f"/tickets/{ticket.id}/comments",
        json={"body": "Tenant message", "visible_to": "all"},
    )

    assert response.status_code == 201
    assert response.json()["author_username"] == tenant.username
    assert db_session.query(TicketComment).filter(
        TicketComment.ticket_id == ticket.id
    ).one().body == "Tenant message"


def test_tenant_cannot_create_private_comment(db_session, company_a, client_factory):
    pm = make_user(db_session, company_a, "private_pm", ROLE_PROPERTY_MANAGER)
    tenant = make_user(db_session, company_a, "private_tenant", ROLE_TENANT)
    ticket = make_ticket(db_session, company_a, pm, tenant)

    response = client_factory(tenant).post(
        f"/tickets/{ticket.id}/comments",
        json={"body": "Private note", "visible_to": "owner_pm"},
    )

    assert response.status_code == 400


def test_tenant_cannot_create_vendor_comment(db_session, company_a, client_factory):
    pm = make_user(db_session, company_a, "vendor_visibility_pm", ROLE_PROPERTY_MANAGER)
    tenant = make_user(db_session, company_a, "vendor_visibility_tenant", ROLE_TENANT)
    ticket = make_ticket(db_session, company_a, pm, tenant)

    response = client_factory(tenant).post(
        f"/tickets/{ticket.id}/comments",
        json={"body": "Vendor-only message", "visible_to": "pm_vendor"},
    )

    assert response.status_code == 400


def test_tenant_get_comments_only_returns_all_visibility(
    db_session, company_a, client_factory
):
    pm = make_user(db_session, company_a, "visibility_pm", ROLE_PROPERTY_MANAGER)
    tenant = make_user(db_session, company_a, "visibility_tenant", ROLE_TENANT)
    ticket = make_ticket(db_session, company_a, pm, tenant)
    db_session.add_all([
        TicketComment(
            ticket_id=ticket.id,
            author_username=pm.username,
            author_role=pm.role,
            body="Public",
            visible_to="all",
        ),
        TicketComment(
            ticket_id=ticket.id,
            author_username=pm.username,
            author_role=pm.role,
            body="Owner only",
            visible_to="owner_pm",
        ),
        TicketComment(
            ticket_id=ticket.id,
            author_username=pm.username,
            author_role=pm.role,
            body="Vendor only",
            visible_to="pm_vendor",
        ),
    ])
    db_session.commit()

    response = client_factory(tenant).get(f"/tickets/{ticket.id}/comments")

    assert response.status_code == 200
    assert [comment["body"] for comment in response.json()] == ["Public"]


def test_pm_can_create_and_read_owner_pm_and_pm_vendor_comments(
    db_session, company_a, client_factory
):
    pm = make_user(db_session, company_a, "pm_visibility", ROLE_PROPERTY_MANAGER)
    tenant = make_user(db_session, company_a, "pm_visibility_tenant", ROLE_TENANT)
    ticket = make_ticket(db_session, company_a, pm, tenant)
    client = client_factory(pm)

    owner_pm = client.post(
        f"/tickets/{ticket.id}/comments",
        json={"body": "Owner update", "visible_to": "owner_pm"},
    )
    pm_vendor = client.post(
        f"/tickets/{ticket.id}/comments",
        json={"body": "Vendor update", "visible_to": "pm_vendor"},
    )

    assert owner_pm.status_code == 201
    assert pm_vendor.status_code == 201
    listed = client.get(f"/tickets/{ticket.id}/comments")
    assert [comment["body"] for comment in listed.json()] == [
        "Owner update",
        "Vendor update",
    ]


def test_pm_can_create_public_comment(db_session, company_a, client_factory):
    pm = make_user(db_session, company_a, "public_pm", ROLE_PROPERTY_MANAGER)
    tenant = make_user(db_session, company_a, "public_tenant", ROLE_TENANT)
    ticket = make_ticket(db_session, company_a, pm, tenant)

    response = client_factory(pm).post(
        f"/tickets/{ticket.id}/comments",
        json={"body": "Public PM update", "visible_to": "all"},
    )

    assert response.status_code == 201


def test_owner_visibility_and_creation_rules(db_session, company_a, client_factory):
    pm = make_user(db_session, company_a, "owner_rules_pm", ROLE_PROPERTY_MANAGER)
    tenant = make_user(db_session, company_a, "owner_rules_tenant", ROLE_TENANT)
    owner = make_user(db_session, company_a, "owner_rules_owner", ROLE_OWNER)
    ticket = make_ticket(db_session, company_a, pm, tenant)
    db_session.add(TicketComment(
        ticket_id=ticket.id,
        author_username=pm.username,
        author_role=pm.role,
        body="Vendor-only",
        visible_to="pm_vendor",
    ))
    db_session.add(TicketComment(
        ticket_id=ticket.id,
        author_username=pm.username,
        author_role=pm.role,
        body="Public",
        visible_to="all",
    ))
    db_session.commit()

    listed = client_factory(owner).get(f"/tickets/{ticket.id}/comments")
    assert listed.status_code == 200
    assert [comment["body"] for comment in listed.json()] == ["Public"]

    public = client_factory(owner).post(
        f"/tickets/{ticket.id}/comments",
        json={"body": "Owner public update", "visible_to": "all"},
    )
    assert public.status_code == 201

    created = client_factory(owner).post(
        f"/tickets/{ticket.id}/comments",
        json={"body": "Owner update", "visible_to": "owner_pm"},
    )
    assert created.status_code == 201

    rejected = client_factory(owner).post(
        f"/tickets/{ticket.id}/comments",
        json={"body": "Not allowed", "visible_to": "pm_vendor"},
    )
    assert rejected.status_code == 400


def test_vendor_sees_all_and_pm_vendor_but_not_owner_pm(
    db_session, company_a, client_factory
):
    pm = make_user(db_session, company_a, "vendor_rules_pm", ROLE_PROPERTY_MANAGER)
    tenant = make_user(db_session, company_a, "vendor_rules_tenant", ROLE_TENANT)
    vendor = make_user(db_session, company_a, "vendor_rules_vendor", ROLE_VENDOR)
    ticket = make_ticket(db_session, company_a, pm, tenant)
    db_session.add_all([
        TicketComment(
            ticket_id=ticket.id,
            author_username=pm.username,
            author_role=pm.role,
            body="Public",
            visible_to="all",
        ),
        TicketComment(
            ticket_id=ticket.id,
            author_username=pm.username,
            author_role=pm.role,
            body="Vendor",
            visible_to="pm_vendor",
        ),
        TicketComment(
            ticket_id=ticket.id,
            author_username=pm.username,
            author_role=pm.role,
            body="Owner PM",
            visible_to="owner_pm",
        ),
    ])
    db_session.commit()

    response = client_factory(vendor).get(f"/tickets/{ticket.id}/comments")

    assert response.status_code == 200
    assert [comment["body"] for comment in response.json()] == ["Public", "Vendor"]


def test_vendor_can_create_all_and_pm_vendor_but_not_owner_pm(
    db_session, company_a, client_factory
):
    pm = make_user(db_session, company_a, "vendor_create_pm", ROLE_PROPERTY_MANAGER)
    tenant = make_user(db_session, company_a, "vendor_create_tenant", ROLE_TENANT)
    vendor = make_user(db_session, company_a, "vendor_create_vendor", ROLE_VENDOR)
    ticket = make_ticket(db_session, company_a, pm, tenant)
    client = client_factory(vendor)

    public = client.post(
        f"/tickets/{ticket.id}/comments",
        json={"body": "Vendor public update", "visible_to": "all"},
    )
    vendor_only = client.post(
        f"/tickets/{ticket.id}/comments",
        json={"body": "Vendor details", "visible_to": "pm_vendor"},
    )
    owner_only = client.post(
        f"/tickets/{ticket.id}/comments",
        json={"body": "Not allowed", "visible_to": "owner_pm"},
    )

    assert public.status_code == 201
    assert vendor_only.status_code == 201
    assert owner_only.status_code == 400


def test_empty_comment_and_cross_company_access_are_rejected(
    db_session, company_a, company_b, client_factory
):
    pm = make_user(db_session, company_a, "security_pm", ROLE_PROPERTY_MANAGER)
    tenant = make_user(db_session, company_a, "security_tenant", ROLE_TENANT)
    other_pm = make_user(db_session, company_b, "other_pm", ROLE_PROPERTY_MANAGER)
    ticket = make_ticket(db_session, company_a, pm, tenant)

    empty = client_factory(tenant).post(
        f"/tickets/{ticket.id}/comments",
        json={"body": "  \n", "visible_to": "all"},
    )
    assert empty.status_code == 400

    cross_company_get = client_factory(other_pm).get(
        f"/tickets/{ticket.id}/comments"
    )
    cross_company_post = client_factory(other_pm).post(
        f"/tickets/{ticket.id}/comments",
        json={"body": "Should fail", "visible_to": "all"},
    )
    assert cross_company_get.status_code == 403
    assert cross_company_post.status_code == 403


def test_pm_notes_backfill_creates_comment_and_preserves_legacy_note(
    db_session, company_a, client_factory
):
    pm = make_user(db_session, company_a, "backfill_pm", ROLE_PROPERTY_MANAGER)
    tenant = make_user(db_session, company_a, "backfill_tenant", ROLE_TENANT)
    ticket = make_ticket(db_session, company_a, pm, tenant)
    ticket.pm_notes = "Check roof drain"
    db_session.commit()

    ticket_comments_migration.backfill_legacy_notes(db_session.connection())
    db_session.expire_all()

    comment = db_session.query(TicketComment).filter(
        TicketComment.ticket_id == ticket.id
    ).one()
    refreshed_ticket = db_session.get(MaintenanceTicket, ticket.id)
    assert comment.body == "Check roof drain"
    assert comment.visible_to == "owner_pm"
    assert comment.author_role == "Property Manager"
    assert comment.author_username == pm.username
    assert refreshed_ticket.pm_notes == "Check roof drain"

    ticket_comments_migration.backfill_legacy_notes(db_session.connection())
    assert db_session.query(TicketComment).filter(
        TicketComment.ticket_id == ticket.id
    ).count() == 1
