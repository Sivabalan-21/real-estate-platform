"""
Day 20 — Seed script & demo data.

Creates a complete, realistic demo dataset for Acme Properties:
  1 Company, 1 Owner, 1 Company Admin, 2 PMs, 3 Tenants,
  2 Properties, 8 Units, 3 active Leases, 4 Maintenance Tickets.

Usage:
    docker compose exec backend python seed.py
    docker compose exec backend python seed.py --reset

Idempotent: running twice without --reset does not duplicate data.
All seeded users share the password: Test1234!
"""
import argparse
import sys
from datetime import date, datetime, timedelta

import bcrypt

from database import SessionLocal
from models import (
    Company,
    User,
    Property,
    Unit,
    Lease,
    MaintenanceTicket,
    PropertyAssignment,
)
from rbac import (
    ROLE_OWNER,
    ROLE_COMPANY_ADMIN,
    ROLE_PROPERTY_MANAGER,
    ROLE_TENANT,
)

SEED_PASSWORD = "Test1234!"
COMPANY_NAME = "Acme Properties"
COMPANY_SLUG = "acme"


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def get_or_create(db, model, defaults=None, **lookup):
    """Idempotency helper: look up by `lookup` kwargs, create with
    `lookup` + `defaults` if not found. Returns (instance, created_bool)."""
    instance = db.query(model).filter_by(**lookup).first()
    if instance:
        return instance, False
    params = {**lookup, **(defaults or {})}
    instance = model(**params)
    db.add(instance)
    db.flush()  # get instance.id without a full commit
    return instance, True


def reset_seed_data(db):
    """Drop all Acme Properties demo data (and only that data) so a
    fresh seed can run. Deleting the company cascades through properties
    (-> units -> photos, leases, maintenance_tickets, property_assignments,
    property_dimensions) at the DB level. Users are deleted separately
    since they're referenced by username, not company_id cascade."""
    company = db.query(Company).filter_by(slug=COMPANY_SLUG).first()
    if not company:
        print("No existing Acme Properties data found — nothing to reset.")
        return

    print(f"Resetting existing '{COMPANY_NAME}' demo data...")

    users = db.query(User).filter_by(company_id=company.id).all()

    # Users (tenants) hold a direct FK to units.id — must be cleared
    # before the property/unit cascade delete below, or Postgres blocks
    # the delete with a foreign key violation.
    for user in users:
        user.unit_id = None
    db.flush()

    properties = db.query(Property).filter_by(company_id=company.id).all()
    for prop in properties:
        db.delete(prop)  # cascades to units, leases, tickets, assignments, dimensions
    db.flush()

    for user in users:
        db.delete(user)
    db.flush()

    db.delete(company)
    db.commit()
    print("Reset complete.")


def seed(db):
    created_summary = []

    # ---- Company -----------------------------------------------------
    company, created = get_or_create(
        db,
        Company,
        name=COMPANY_NAME,
        defaults={
            "slug": COMPANY_SLUG,
            "company_code": "ACME0001",
        },
    )
    created_summary.append(("Company", COMPANY_NAME, created))

    # ---- Users ----------------------------------------------------------
    hashed_pw = hash_password(SEED_PASSWORD)

    def make_user(username, email, full_name, role, **extra):
        user, created = get_or_create(
            db,
            User,
            email=email,
            defaults={
                "username": username,
                "full_name": full_name,
                "password": hashed_pw,
                "role": role,
                "company_id": company.id,
                "status": "active",
                **extra,
            },
        )
        created_summary.append(("User", email, created))
        return user

    owner = make_user("owner_acme", "owner@acme.com", "Olivia Owner", ROLE_OWNER)
    admin = make_user("admin_acme", "admin@acme.com", "Alex Admin", ROLE_COMPANY_ADMIN)
    pm1 = make_user("pm1", "pm1@acme.com", "Priya Manager", ROLE_PROPERTY_MANAGER)
    pm2 = make_user("pm2", "pm2@acme.com", "Paul Manager", ROLE_PROPERTY_MANAGER)

    tenant1 = make_user(
        "tenant1", "tenant1@acme.com", "Tara Tenant", ROLE_TENANT,
        tenant_status="ACTIVE",
    )
    tenant2 = make_user(
        "tenant2", "tenant2@acme.com", "Tom Tenant", ROLE_TENANT,
        tenant_status="ACTIVE",
    )
    tenant3 = make_user(
        "tenant3", "tenant3@acme.com", "Tina Tenant", ROLE_TENANT,
        tenant_status="ACTIVE",
    )
    db.flush()

    # ---- Properties -------------------------------------------------
        oak, created = get_or_create(
        db,
        Property,
        name="Oak Residences",
        company_id=company.id,
        defaults={
            "address": "12 Oak Street",
            "description": "Mid-rise residential building",
            "status": "active",
            "total_units": 5,
        },
    )
    created_summary.append(("Property", "Oak Residences", created))

    maple, created = get_or_create(
        db,
        Property,
        name="Maple Tower",
        company_id=company.id,
        defaults={
            "address": "88 Maple Avenue",
            "description": "High-rise mixed residential/commercial tower",
            "status": "active",
            "total_units": 5,
        },
    )
    created_summary.append(("Property", "Maple Tower", created))
    db.flush()

    # ---- Property assignments (PM -> Property) -----------------------
    # PM1 assigned only to Oak Residences, PM2 only to Maple Tower —
    # this is what lets the Day 20 acceptance check ("PM1 doesn't see
    # Maple Tower tickets") actually be meaningful.
    _, created = get_or_create(
        db, PropertyAssignment,
        property_id=oak.id, pm_username=pm1.username,
        defaults={"assigned_by": admin.username},
    )
    created_summary.append(("PropertyAssignment", f"{pm1.username} -> Oak", created))

    _, created = get_or_create(
        db, PropertyAssignment,
        property_id=maple.id, pm_username=pm2.username,
        defaults={"assigned_by": admin.username},
    )
    created_summary.append(("PropertyAssignment", f"{pm2.username} -> Maple", created))
    db.flush()

    # ---- Units --------------------------------------------------------
    def make_unit(prop, unit_number, unit_type, status, **extra):
        unit, created = get_or_create(
            db,
            Unit,
            property_id=prop.id,
            unit_number=unit_number,
            defaults={
                "type": unit_type,
                "status": status,
                **extra,
            },
        )
        created_summary.append(("Unit", f"{prop.name}/{unit_number}", created))
        return unit

    oak_101 = make_unit(oak, "OAK-101", "Studio", "vacant", beds=0, baths=1, sqft=450, floor=1, rent_amount=1200)
    oak_102 = make_unit(oak, "OAK-102", "1BR", "occupied", beds=1, baths=1, sqft=650, floor=1, rent_amount=1500)
    oak_103 = make_unit(oak, "OAK-103", "2BR", "occupied", beds=2, baths=2, sqft=950, floor=2, rent_amount=2100)
    oak_104 = make_unit(oak, "OAK-104", "1BR", "maintenance", beds=1, baths=1, sqft=680, floor=2, rent_amount=1550)

    map_201 = make_unit(maple, "MAP-201", "2BR", "occupied", beds=2, baths=2, sqft=1100, floor=3, rent_amount=2400)
    map_202 = make_unit(maple, "MAP-202", "3BR", "vacant", beds=3, baths=2, sqft=1400, floor=4, rent_amount=3000)
    map_203 = make_unit(maple, "MAP-203", "Studio", "vacant", beds=0, baths=1, sqft=500, floor=1, rent_amount=1300)
    map_204 = make_unit(maple, "MAP-204", "1BR", "maintenance", beds=1, baths=1, sqft=700, floor=2, rent_amount=1650)
    db.flush()

    # ---- Leases (3 active, linking tenants to occupied units) --------
    def make_lease(prop, unit, tenant_username, monthly_rent):
        lease, created = get_or_create(
            db,
            Lease,
            unit_id=unit.id,
            defaults={
                "property_id": prop.id,
                "tenant_username": tenant_username,
                "start_date": date.today() - timedelta(days=90),
                "end_date": date.today() + timedelta(days=275),
                "monthly_rent": monthly_rent,
                "status": "active",
            },
        )
        created_summary.append(("Lease", f"{unit.unit_number} -> {tenant_username}", created))
        return lease

    make_lease(oak, oak_102, tenant1.username, 1500)
    make_lease(oak, oak_103, tenant2.username, 2100)
    make_lease(maple, map_201, tenant3.username, 2400)

    # Link tenants to their units directly too, per the User.unit_id
    # comment in models.py (Tenant dashboard reads this without waiting
    # on the Lease join).
    tenant1.unit_id = oak_102.id
    tenant2.unit_id = oak_103.id
    tenant3.unit_id = map_201.id
    db.flush()

    # ---- Maintenance Tickets (4, mixed categories/statuses/properties) --
    def make_ticket(prop, unit, title, category, status, priority, assigned_pm, **extra):
        ticket, created = get_or_create(
            db,
            MaintenanceTicket,
            title=title,
            property_id=prop.id,
            defaults={
                "company_id": company.id,
                "unit_id": unit.id if unit else None,
                "description": f"{title} — seeded demo ticket.",
                "category": category,
                "status": status,
                "priority": priority,
                "created_by": tenant1.username,
                "assigned_pm": assigned_pm,
                **extra,
            },
        )
        created_summary.append(("MaintenanceTicket", title, created))
        return ticket

    make_ticket(oak, oak_102, "Leaking kitchen faucet", "Plumbing", "open", "normal", pm1.username, created_by=tenant1.username)
    make_ticket(oak, oak_104, "AC unit not cooling", "HVAC", "in_progress", "high", pm1.username, created_by=tenant2.username)
    make_ticket(maple, map_201, "Bedroom light fixture flickering", "Electrical", "closed", "low", pm2.username, created_by=tenant3.username, closed_at=datetime.utcnow())
    make_ticket(maple, map_204, "Pest sighting in hallway", "Pest", "open", "urgent", pm2.username, created_by=tenant3.username)

    db.commit()
    return created_summary


def main():
    parser = argparse.ArgumentParser(description="Seed demo data for Acme Properties.")
    parser.add_argument("--reset", action="store_true", help="Drop and recreate all seed data.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.reset:
            reset_seed_data(db)

        summary = seed(db)

        created = [s for s in summary if s[2]]
        skipped = [s for s in summary if not s[2]]

        print(f"\nSeed complete: {len(created)} created, {len(skipped)} already existed.")
        if created:
            print("\nCreated:")
            for kind, name, _ in created:
                print(f"  + {kind}: {name}")
        if skipped:
            print("\nAlready existed (skipped):")
            for kind, name, _ in skipped:
                print(f"  = {kind}: {name}")

        print(f"\nAll seeded users can log in with password: {SEED_PASSWORD}")
        print("  owner@acme.com, admin@acme.com, pm1@acme.com, pm2@acme.com,")
        print("  tenant1@acme.com, tenant2@acme.com, tenant3@acme.com")

    except Exception as exc:
        db.rollback()
        print(f"\nERROR: seeding failed — {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()