"""Logged-in vendor dashboard: Vendor<->User link, job list/detail, quote
upload, and default-deny access for Vendor logins.

Uses REAL bearer tokens (only get_db is overridden), so the Vendor
default-deny check inside current_user is exercised for real.
"""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

import main
from models import (
    Company, MaintenanceTicket, Property, PropertyAssignment, TicketAttachment,
    TicketHistory, Unit, User, Vendor,
)
from rbac import ROLE_PROPERTY_MANAGER, ROLE_TENANT, ROLE_VENDOR
from tokens import create_access_token

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


@pytest.fixture(autouse=True)
def tmp_uploads(tmp_path, monkeypatch):
    (tmp_path / "uploads").mkdir()
    monkeypatch.chdir(tmp_path)


@pytest.fixture(autouse=True)
def no_mail(monkeypatch):
    async def fake(*a, **k):
        return True
    monkeypatch.setattr(main, "send_email", fake)
    monkeypatch.setattr(main, "notify_quote_received_pm", fake)


@pytest.fixture
def api(db_session):
    def _get_db():
        yield db_session
    main.app.dependency_overrides[main.get_db] = _get_db
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def _hdr(user):
    t = create_access_token({"sub": user.username, "role": user.role, "company_id": user.company_id})
    return {"Authorization": f"Bearer {t}"}


def _user(db, company, username, role, email=None, **kw):
    u = User(id=str(uuid.uuid4()), username=username, email=email or f"{username}@example.com",
             role=role, company_id=company.id, status="active", **kw)
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def world(db_session, company_a, company_b):
    db = db_session
    pm = _user(db, company_a, "pm_v", ROLE_PROPERTY_MANAGER, full_name="Priya Manager", phone="+91 90000 11111")
    tenant = _user(db, company_a, "tenant_v", ROLE_TENANT, email="secret.tenant@example.com", full_name="Secret Tenant")
    vuser = _user(db, company_a, "raj", ROLE_VENDOR, email="Vendor@Acme.com")
    other_vuser = _user(db, company_a, "other_v", ROLE_VENDOR, email="other@acme.com")

    prop = Property(id=str(uuid.uuid4()), company_id=company_a.id, name="Oak Residences",
                    address="12 Oak Street", total_units=1)
    db.add(prop)
    db.commit()
    unit = Unit(id=str(uuid.uuid4()), property_id=prop.id, unit_number="102", type="2BR")
    db.add(unit)
    db.add(PropertyAssignment(id=str(uuid.uuid4()), property_id=prop.id, pm_username=pm.username))

    raj = Vendor(company_id=company_a.id, name="Raj Electricals", category="Electrical",
                 email="vendor@acme.com", phone="8610279302")           # NOTE: no user_id yet
    other = Vendor(company_id=company_a.id, name="Other Co", category="Plumbing", email="other@acme.com")
    db.add_all([raj, other])
    db.commit()

    def ticket(vendor, title, status="quote_requested", company=company_a):
        t = MaintenanceTicket(
            id=str(uuid.uuid4()), company_id=company.id, property_id=prop.id, unit_id=unit.id,
            title=title, description=f"{title} details", category="HVAC", status=status,
            created_by=tenant.username, assigned_pm=pm.username,
            assigned_vendor_id=vendor.id if vendor else None,
        )
        db.add(t)
        db.commit()
        db.add(TicketHistory(ticket_id=t.id, from_status=None, to_status="open",
                             changed_by=tenant.username, note="INTERNAL PM NOTE"))
        db.commit()
        return t

    class W: pass
    w = W()
    w.pm, w.tenant, w.vuser, w.other_vuser = pm, tenant, vuser, other_vuser
    w.raj, w.other, w.prop, w.unit = raj, other, prop, unit
    w.mine = ticket(raj, "HVAC issue")
    w.mine_done = ticket(raj, "Old roof", status="completed")
    w.theirs = ticket(other, "Someone else's job")
    w.unassigned = ticket(None, "Unassigned", status="open")
    w.add_ticket = ticket
    return w


# ------------------------------ linking ------------------------------------
def test_jobs_lazily_link_by_email_case_insensitive(api, db_session, world):
    assert world.raj.user_id is None
    r = api.get("/vendor/jobs", headers=_hdr(world.vuser))
    assert r.status_code == 200
    db_session.refresh(world.raj)
    assert world.raj.user_id == world.vuser.id


def test_jobs_only_this_vendors_tickets(api, world):
    b = api.get("/vendor/jobs", headers=_hdr(world.vuser)).json()
    assert b["reason"] is None
    assert b["vendor"]["name"] == "Raj Electricals"
    titles = {j["title"] for j in b["jobs"]}
    assert titles == {"HVAC issue", "Old roof"}


def test_job_summary_shape(api, world):
    j = next(j for j in api.get("/vendor/jobs", headers=_hdr(world.vuser)).json()["jobs"] if j["title"] == "HVAC issue")
    assert j["status"] == "quote_requested" and j["status_label"] == "Quote Requested"
    assert j["can_submit_quote"] is True
    assert j["job_title"] == "HVAC Repair \u2014 Unit 102, Oak Residences"


def test_no_vendor_profile_is_reported_not_faked(api, db_session, company_a):
    orphan = _user(db_session, company_a, "orphan_v", ROLE_VENDOR, email="nobody@acme.com")
    r = api.get("/vendor/jobs", headers=_hdr(orphan))
    assert r.status_code == 200
    assert r.json() == {"vendor": None, "jobs": [], "reason": "no_vendor_profile"}


def test_same_email_in_other_company_is_not_linked(api, db_session, company_b, world):
    v = Vendor(company_id=company_b.id, name="B Co", category="Plumbing", email="cross@acme.com")
    db_session.add(v)
    cross = _user(db_session, world.raj.company, "cross_v", ROLE_VENDOR, email="cross@acme.com")
    db_session.commit()
    assert api.get("/vendor/jobs", headers=_hdr(cross)).json()["reason"] == "no_vendor_profile"


def test_inactive_vendor_sees_nothing_and_cannot_open_jobs(api, db_session, world):
    world.raj.is_active = False
    db_session.commit()
    assert api.get("/vendor/jobs", headers=_hdr(world.vuser)).json()["reason"] == "vendor_inactive"
    r = api.get(f"/vendor/jobs/{world.mine.id}", headers=_hdr(world.vuser))
    assert r.status_code == 403 and r.json()["detail"]["code"] == "vendor_inactive"


def test_non_vendor_cannot_use_vendor_jobs(api, world):
    assert api.get("/vendor/jobs", headers=_hdr(world.pm)).status_code == 403
    assert api.get(f"/vendor/jobs/{world.mine.id}", headers=_hdr(world.pm)).status_code == 403


def test_registration_links_vendor_profile(api, db_session, company_a):
    v = Vendor(company_id=company_a.id, name="Fresh Co", category="Plumbing", email="fresh@acme.com")
    invited = User(id=str(uuid.uuid4()), email="fresh@acme.com", role=ROLE_VENDOR, company_id=company_a.id,
                   status="invited", reset_token="invite-tok", token_type="invite",
                   token_expiry=datetime.utcnow() + timedelta(hours=1))
    db_session.add_all([v, invited])
    db_session.commit()
    r = api.post("/complete-registration/invite-tok", json={"username": "fresh", "password": "Passw0rd!"})
    assert r.status_code == 200, r.text
    db_session.refresh(v)
    assert v.user_id == invited.id


# ------------------------------- detail ------------------------------------
def test_detail_own_job_no_tenant_or_internal_leak(api, db_session, world):
    db_session.add(TicketAttachment(ticket_id=world.mine.id, url="http://x/p.png", filename="p.png",
                                    type="photo", uploaded_by=world.tenant.username))
    db_session.add(TicketAttachment(ticket_id=world.mine.id, url="http://x/n.pdf", filename="n.pdf",
                                    type="pm_note", uploaded_by=world.pm.username))
    db_session.add(TicketAttachment(ticket_id=world.mine.id, url="http://x/other.pdf", filename="other.pdf",
                                    type="quote", uploaded_by="vendor:Other Co"))
    db_session.add(TicketAttachment(ticket_id=world.mine.id, url="http://x/mine.pdf", filename="mine.pdf",
                                    type="quote", uploaded_by="vendor:Raj Electricals"))
    db_session.commit()

    r = api.get(f"/vendor/jobs/{world.mine.id}", headers=_hdr(world.vuser))
    assert r.status_code == 200
    b = r.json()
    assert b["property_address"] == "12 Oak Street"
    assert [p["filename"] for p in b["photos"]] == ["p.png"]
    assert [q["filename"] for q in b["quotes"]] == ["mine.pdf"]       # not Other Co's, not pm_note
    assert b["pm"] == {"name": "Priya Manager", "phone": "+91 90000 11111"}
    assert b["timeline"] and set(b["timeline"][0]) == {"status", "at"}
    text = r.text
    for secret in ("Secret Tenant", "secret.tenant@example.com", world.tenant.username, "INTERNAL PM NOTE", "n.pdf"):
        assert secret not in text


def test_detail_of_someone_elses_or_unassigned_job_is_404(api, world):
    for t in (world.theirs, world.unassigned):
        assert api.get(f"/vendor/jobs/{t.id}", headers=_hdr(world.vuser)).status_code == 404
    assert api.get("/vendor/jobs/does-not-exist", headers=_hdr(world.vuser)).status_code == 404


# -------------------------------- quote ------------------------------------
def _quote(api, user, ticket_id, content=PDF, name="q.pdf", amount=None):
    return api.post(f"/vendor/jobs/{ticket_id}/quote", headers=_hdr(user),
                    files={"file": (name, content, "application/pdf")},
                    data={"quote_amount": amount} if amount else {})


def test_quote_upload_moves_ticket_and_records_quote(api, db_session, world):
    r = _quote(api, world.vuser, world.mine.id, amount="4,500")
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "quote_received" and r.json()["quote_amount"] == 4500
    db_session.refresh(world.mine)
    assert world.mine.status == "quote_received"
    h = db_session.query(TicketHistory).filter_by(ticket_id=world.mine.id, to_status="quote_received").one()
    assert h.changed_by == "vendor:Raj Electricals"
    detail = api.get(f"/vendor/jobs/{world.mine.id}", headers=_hdr(world.vuser)).json()
    assert detail["can_submit_quote"] is False and len(detail["quotes"]) == 1


def test_quote_second_upload_rejected(api, world):
    assert _quote(api, world.vuser, world.mine.id).status_code == 201
    assert _quote(api, world.vuser, world.mine.id).status_code == 400


def test_quote_must_be_real_pdf_and_amount_valid(api, world):
    assert _quote(api, world.vuser, world.mine.id, content=b"not a pdf").status_code == 400
    assert _quote(api, world.vuser, world.mine.id, amount="-5").status_code == 400
    assert _quote(api, world.vuser, world.mine.id, amount="abc").status_code == 400


def test_quote_on_other_vendors_job_is_404(api, db_session, world):
    assert _quote(api, world.vuser, world.theirs.id).status_code == 404
    db_session.refresh(world.theirs)
    assert world.theirs.status == "quote_requested"


def test_quote_not_allowed_outside_quote_requested(api, world):
    assert _quote(api, world.vuser, world.mine_done.id).status_code == 400


# ------------------------ default-deny for Vendor logins --------------------
@pytest.mark.parametrize("path", [
    "/properties", "/users/my-hierarchy", "/pm/tickets", "/owner/tickets", "/tenant/tickets",
    "/dimension-types",
])
def test_vendor_login_blocked_from_company_data(api, world, path):
    assert api.get(path, headers=_hdr(world.vuser)).status_code == 403


def test_vendor_login_blocked_from_generic_ticket_and_property_endpoints(api, world):
    h = _hdr(world.vuser)
    assert api.get(f"/tickets/{world.mine.id}", headers=h).status_code == 403
    assert api.get(f"/tickets/{world.mine.id}/attachments", headers=h).status_code == 403
    assert api.get(f"/properties/{world.prop.id}/tickets", headers=h).status_code == 403
    assert api.get(f"/properties/{world.prop.id}/leases", headers=h).status_code == 403
    assert api.get(f"/units/{world.unit.id}/lease", headers=h).status_code == 403


def test_vendor_login_still_reaches_its_own_surface(api, world):
    h = _hdr(world.vuser)
    assert api.get("/users/me", headers=h).status_code == 200
    assert api.get("/vendors", headers=h).status_code == 200
    assert api.get("/vendor/jobs", headers=h).status_code == 200


def test_comments_only_on_assigned_tickets(api, world):
    h = _hdr(world.vuser)
    assert api.get(f"/tickets/{world.mine.id}/comments", headers=h).status_code == 200
    r = api.post(f"/tickets/{world.mine.id}/comments", headers=h,
                 json={"body": "On my way Thursday", "visible_to": "pm_vendor"})
    assert r.status_code == 201
    assert api.get(f"/tickets/{world.theirs.id}/comments", headers=h).status_code == 403
    assert api.post(f"/tickets/{world.theirs.id}/comments", headers=h,
                    json={"body": "hi", "visible_to": "all"}).status_code == 403


def test_other_roles_unaffected_by_vendor_default_deny(api, world):
    assert api.get("/properties", headers=_hdr(world.pm)).status_code == 200
    assert api.get(f"/tickets/{world.mine.id}", headers=_hdr(world.pm)).status_code == 200

def _invoice(api, user, ticket_id, content=b"%PDF-1.4 invoice", filename="invoice.pdf"):
    return api.post(
        f"/vendor/jobs/{ticket_id}/invoice",
        headers=_hdr(user),
        files={"file": (filename, content, "application/pdf")},
    )


def _set_status(db_session, ticket, status):
    ticket.status = status
    db_session.commit()


def test_invoice_upload_stored_as_vendor_invoice(api, db_session, world):
    _set_status(db_session, world.mine, "completed")
    r = _invoice(api, world.vuser, world.mine.id)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["type"] == "invoice"
    assert body["uploaded_by_role"] == "vendor"
    assert body["size_kb"] >= 1

    rows = db_session.query(TicketAttachment).filter_by(
        ticket_id=world.mine.id, type="invoice"
    ).all()
    assert len(rows) == 1
    db_session.refresh(world.mine)
    assert world.mine.status == "completed"      # invoice upload never changes status


def test_invoice_allowed_while_completed_and_multiple_invoices(api, db_session, world):
    _set_status(db_session, world.mine, "completed")
    assert _invoice(api, world.vuser, world.mine.id).status_code == 201
    assert _invoice(api, world.vuser, world.mine.id).status_code == 201   # corrected invoice


def test_invoice_refused_before_work_is_completed(api, db_session, world):
    for status in ("quote_requested", "approved", "in_progress"):
        _set_status(db_session, world.mine, status)
        r = _invoice(api, world.vuser, world.mine.id)
        assert r.status_code == 400
        assert "completed" in r.text


def test_invoice_must_be_real_pdf(api, db_session, world):
    _set_status(db_session, world.mine, "completed")
    assert _invoice(api, world.vuser, world.mine.id, content=b"not a pdf").status_code == 400


def test_invoice_over_10mb_rejected(api, db_session, world):
    _set_status(db_session, world.mine, "completed")
    big = b"%PDF-" + b"x" * (10 * 1024 * 1024 + 1)
    r = _invoice(api, world.vuser, world.mine.id, content=big)
    assert r.status_code == 400
    assert "File too large (max 10MB)" in r.text


def test_invoice_counts_toward_20mb_ticket_total(api, db_session, world):
    _set_status(db_session, world.mine, "completed")
    nine_mb = b"%PDF-" + b"x" * (9 * 1024 * 1024)
    assert _invoice(api, world.vuser, world.mine.id, content=nine_mb).status_code == 201
    assert _invoice(api, world.vuser, world.mine.id, content=nine_mb).status_code == 201   # 18 MB
    r = _invoice(api, world.vuser, world.mine.id, content=nine_mb)                          # 27 MB
    assert r.status_code == 400
    assert "20MB" in r.text


def test_invoice_on_other_vendors_job_is_404(api, db_session, world):
    _set_status(db_session, world.theirs, "completed")
    assert _invoice(api, world.vuser, world.theirs.id).status_code == 404


def test_job_detail_lists_own_invoices_and_flag(api, db_session, world):
    detail = api.get(f"/vendor/jobs/{world.mine.id}", headers=_hdr(world.vuser)).json()
    assert detail["can_submit_invoice"] is False and detail["invoices"] == []

    _set_status(db_session, world.mine, "completed")
    assert _invoice(api, world.vuser, world.mine.id).status_code == 201
    detail = api.get(f"/vendor/jobs/{world.mine.id}", headers=_hdr(world.vuser)).json()
    assert detail["can_submit_invoice"] is True
    assert len(detail["invoices"]) == 1