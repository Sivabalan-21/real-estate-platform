"""
Owner portfolio dashboard tests (Day 10).

Run with:  pytest tests/test_owner_portfolio.py -v
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


def make_property(db_session, company, created_by, name="Test Tower", total_units=10):
    p = Property(id=str(uuid.uuid4()), company_id=company.id, name=name,
                 created_by=created_by, total_units=total_units)
    db_session.add(p)
    db_session.commit()
    return p


def test_non_owner_cannot_access_portfolio(db_session, company_a, pm_user, client_factory):
    client = client_factory(pm_user)
    res = client.get("/owner/portfolio")
    assert res.status_code == 403


def test_empty_company_returns_empty_list(db_session, company_a, client_factory):
    owner = make_owner(db_session, company_a)
    client = client_factory(owner)
    res = client.get("/owner/portfolio")
    assert res.status_code == 200
    assert res.json() == []


def test_portfolio_kpis_match_hand_counted_totals(db_session, company_a, admin_user, client_factory):
    owner = make_owner(db_session, company_a)
    admin_client = client_factory(admin_user)
    prop = make_property(db_session, company_a, created_by=admin_user.username, name="Green Trends")

    # 4 units: 2 occupied, 1 vacant, 1 maintenance — hand-counted expectation below
    for i, target_status in enumerate(["occupied", "occupied", "vacant", "maintenance"]):
        unit = admin_client.post(f"/properties/{prop.id}/units", json={
            "unit_number": f"U{i}", "type": "1BR",
        }).json()
        admin_client.put(f"/units/{unit['id']}", json={"status": target_status})

    owner_client = client_factory(owner)
    res = owner_client.get("/owner/portfolio")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1

    card = body[0]
    assert card["name"] == "Green Trends"
    assert card["total_units"] == 4
    assert card["occupied_count"] == 2
    assert card["vacant_count"] == 1
    assert card["maintenance_count"] == 1
    assert card["open_ticket_count"] == 0  # no maintenance_tickets table yet


def test_portfolio_scoped_to_owners_company(db_session, company_a, company_b, admin_user, client_factory):
    owner = make_owner(db_session, company_a)
    admin_client = client_factory(admin_user)
    make_property(db_session, company_a, created_by=admin_user.username, name="In Company A")

    # A property in a different company must never leak into this Owner's portfolio
    from models import User as UserModel
    admin_b = UserModel(id=str(uuid.uuid4()), username="admin_b", email="admin_b@example.com",
                         role=admin_user.role, company_id=company_b.id, status="active")
    db_session.add(admin_b)
    db_session.commit()
    make_property(db_session, company_b, created_by="admin_b", name="In Company B")

    owner_client = client_factory(owner)
    res = owner_client.get("/owner/portfolio")
    assert res.status_code == 200
    names = [p["name"] for p in res.json()]
    assert names == ["In Company A"]


def test_portfolio_all_units_occupied_shows_full_occupancy(db_session, company_a, admin_user, client_factory):
    owner = make_owner(db_session, company_a)
    admin_client = client_factory(admin_user)
    prop = make_property(db_session, company_a, created_by=admin_user.username, name="Full House")

    for i in range(3):
        unit = admin_client.post(f"/properties/{prop.id}/units", json={
            "unit_number": f"F{i}", "type": "Studio",
        }).json()
        admin_client.put(f"/units/{unit['id']}", json={"status": "occupied"})

    owner_client = client_factory(owner)
    card = owner_client.get("/owner/portfolio").json()[0]
    assert card["total_units"] == 3
    assert card["occupied_count"] == 3
    assert card["vacant_count"] == 0