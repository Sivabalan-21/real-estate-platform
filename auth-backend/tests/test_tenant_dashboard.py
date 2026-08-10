"""
Tenant dashboard — lease & unit view (Day 13).

Covers /tenant/me: unit/lease/PM data shape, days_to_expiry calculation
(and therefore the renewal-banner threshold the frontend uses), and that
PM contact is pulled from PropertyAssignment rather than hardcoded.

Run with:  pytest tests/test_tenant_dashboard.py -v
"""
import uuid
from datetime import date, timedelta

from models import Property, Unit, Lease, PropertyAssignment, User
from rbac import ROLE_TENANT, ROLE_PROPERTY_MANAGER


def make_property(db_session, company, created_by, name="Test Tower"):
    p = Property(id=str(uuid.uuid4()), company_id=company.id, name=name,
                 address="123 Test St", created_by=created_by, total_units=5)
    db_session.add(p)
    db_session.commit()
    return p


def make_unit(db_session, property_, unit_number="A-101", rent=25000.0):
    u = Unit(id=str(uuid.uuid4()), property_id=property_.id, unit_number=unit_number,
              type="2BHK", beds=2, baths=2, sqft=1200, status="occupied", rent_amount=rent)
    db_session.add(u)
    db_session.commit()
    return u


def make_tenant(db_session, company, username="tenant_a", email="tenant_a@example.com"):
    t = User(id=str(uuid.uuid4()), username=username, email=email, full_name="Test Tenant",
             role=ROLE_TENANT, company_id=company.id, status="active")
    db_session.add(t)
    db_session.commit()
    return t


def make_lease(db_session, property_, unit, tenant, end_date, monthly_rent=25000.0):
    lease = Lease(id=str(uuid.uuid4()), property_id=property_.id, unit_id=unit.id,
                   tenant_username=tenant.username, start_date=date(2025, 1, 1),
                   end_date=end_date, monthly_rent=monthly_rent, status="active")
    db_session.add(lease)
    db_session.commit()
    return lease


def make_pm_assignment(db_session, property_, company):
    pm = User(id=str(uuid.uuid4()), username="pm_dashboard", email="pm_dashboard@example.com",
              full_name="Priya PM", role=ROLE_PROPERTY_MANAGER, company_id=company.id, status="active")
    db_session.add(pm)
    db_session.commit()
    assignment = PropertyAssignment(id=str(uuid.uuid4()), property_id=property_.id, pm_username=pm.username)
    db_session.add(assignment)
    db_session.commit()
    return pm


def test_tenant_me_returns_unit_lease_and_pm(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, pm_user.username)
    unit = make_unit(db_session, prop)
    tenant = make_tenant(db_session, company_a)
    make_lease(db_session, prop, unit, tenant, end_date=date.today() + timedelta(days=200))
    pm = make_pm_assignment(db_session, prop, company_a)

    res = client_factory(tenant).get("/tenant/me")
    assert res.status_code == 200
    data = res.json()

    assert data["unit"]["unit_number"] == "A-101"
    assert data["unit"]["property_name"] == "Test Tower"
    assert data["lease"]["monthly_rent"] == 25000.0
    assert data["property_manager"]["pm_name"] == "Priya PM"
    assert data["property_manager"]["pm_email"] == pm.email


def test_lease_ending_within_60_days_flags_renewal(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, pm_user.username)
    unit = make_unit(db_session, prop)
    tenant = make_tenant(db_session, company_a, username="tenant_soon", email="soon@example.com")
    make_lease(db_session, prop, unit, tenant, end_date=date.today() + timedelta(days=25))

    res = client_factory(tenant).get("/tenant/me")
    days = res.json()["lease"]["days_to_expiry"]
    assert 0 <= days <= 60


def test_lease_ending_beyond_60_days_no_renewal_flag(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, pm_user.username)
    unit = make_unit(db_session, prop)
    tenant = make_tenant(db_session, company_a, username="tenant_far", email="far@example.com")
    make_lease(db_session, prop, unit, tenant, end_date=date.today() + timedelta(days=200))

    res = client_factory(tenant).get("/tenant/me")
    days = res.json()["lease"]["days_to_expiry"]
    assert days > 60


def test_days_to_expiry_exact_boundary(db_session, company_a, pm_user, client_factory):
    """Aug-31 lease checked well before that date should land inside the
    60-day window -- this mirrors the exact scenario in the acceptance
    criteria rather than an arbitrary date."""
    prop = make_property(db_session, company_a, pm_user.username)
    unit = make_unit(db_session, prop)
    tenant = make_tenant(db_session, company_a, username="tenant_boundary", email="boundary@example.com")
    make_lease(db_session, prop, unit, tenant, end_date=date.today() + timedelta(days=60))

    res = client_factory(tenant).get("/tenant/me")
    assert res.json()["lease"]["days_to_expiry"] == 60


def test_no_active_lease_returns_404(db_session, company_a, client_factory):
    tenant = make_tenant(db_session, company_a, username="tenant_nolease", email="nolease@example.com")
    res = client_factory(tenant).get("/tenant/me")
    assert res.status_code == 404


def test_non_tenant_forbidden(db_session, pm_user, client_factory):
    res = client_factory(pm_user).get("/tenant/me")
    assert res.status_code == 403


def test_no_pm_assigned_returns_null_property_manager(db_session, company_a, pm_user, client_factory):
    prop = make_property(db_session, company_a, pm_user.username)
    unit = make_unit(db_session, prop)
    tenant = make_tenant(db_session, company_a, username="tenant_nopm", email="nopm@example.com")
    make_lease(db_session, prop, unit, tenant, end_date=date.today() + timedelta(days=200))
    # deliberately no PropertyAssignment created

    res = client_factory(tenant).get("/tenant/me")
    assert res.json()["property_manager"] is None