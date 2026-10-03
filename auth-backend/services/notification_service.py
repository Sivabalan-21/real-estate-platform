import asyncio
import os
import traceback
from urllib.parse import quote

from models import User, PropertyAssignment, Company, Vendor, VendorTicketAccess
from rbac import ROLE_OWNER, ROLE_TENANT
from ticket_states import PENDING_OWNER_APPROVAL
from tokens import create_vendor_access_token, is_token_expired
CURRENCY = "₹"              # change if your quotes use another currency
SEND_TIMEOUT_SECONDS = 20   # stops a dead mail server from hanging the API


def _frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")


def _app_link(ticket, db, path: str) -> str:
    """Link into the app for an email.

    Goes through the company's own login page (/portal/<slug>) and passes the
    real destination as ?next=, so a signed-out person logs in on THEIR
    company's page and is then taken straight to `path`. Falls back to the
    plain app link if the company has no slug.
    """
    slug = None
    company_id = getattr(ticket, "company_id", None)
    if company_id:
        company = db.query(Company).filter(Company.id == company_id).first()
        slug = company.slug if company else None
    if not slug:
        return f"{_frontend_url()}{path}"
    return f"{_frontend_url()}/portal/{slug}?next={quote(path, safe='')}"


async def _send(to_email, subject, body) -> bool:
    """Send one email. Never raises. Logs errors to stdout."""
    if not to_email:
        print(f"[notify] skipped '{subject}': recipient has no email")
        return False
    try:
        # Imported here (not at top) to avoid a circular import with main.py
        from main import send_email
        await asyncio.wait_for(
            send_email(to_email, subject, body),
            timeout=SEND_TIMEOUT_SECONDS,
        )
        print(f"[notify] sent '{subject}' -> {to_email}")
        return True
    except Exception as exc:
        print(f"[notify] EMAIL FAILED '{subject}' -> {to_email}: {type(exc).__name__}: {exc}")
        return False


def _display_name(user) -> str:
    return (user.full_name or user.username) if user else "Unknown"


def _place(ticket) -> str:
    prop = ticket.property.name if ticket.property else "Property"
    if ticket.unit:
        return f"{prop} Unit {ticket.unit.unit_number}"
    return prop


def _get_pm_users(ticket, db):
    """The ticket's assigned PM if set, otherwise every PM assigned to the property."""
    pms = {}
    if ticket.assigned_pm:
        u = db.query(User).filter(User.username == ticket.assigned_pm).first()
        if u:
            pms[u.id] = u
    if not pms:
        rows = (
            db.query(PropertyAssignment)
            .filter(PropertyAssignment.property_id == ticket.property_id)
            .all()
        )
        for r in rows:
            if r.pm_user:
                pms[r.pm_user.id] = r.pm_user
    return list(pms.values())


async def notify_ticket_created(ticket, db):
    try:
        pms = _get_pm_users(ticket, db)
        if not pms:
            print(f"[notify] ticket {ticket.id}: no PM found for property, skipping")
            return

        place = _place(ticket)
        tenant = (
            db.query(User).filter(User.username == ticket.created_by).first()
            if ticket.created_by else None
        )
        link = _app_link(ticket, db, f"/pm/tickets/{ticket.id}")
        subject = f"New Maintenance Request — {place}"

        for pm in pms:
            body = f"""
Hi {_display_name(pm)},

A new maintenance request has been submitted.

Property : {place}
Tenant   : {_display_name(tenant) if tenant else ticket.created_by}
Category : {ticket.category or "-"}
Details  : {ticket.description or "-"}

View the ticket:
{link}

Regards,
Property Portal Team
"""
            await _send(pm.email, subject, body)
    except Exception as exc:
        print(f"[notify] notify_ticket_created error: {exc}")
        traceback.print_exc()


async def notify_quote_submitted(ticket, db):
    try:
        owners = (
            db.query(User)
            .filter(
                User.company_id == ticket.company_id,
                User.role == ROLE_OWNER,
                User.status.ilike("active"),
            )
            .all()
        )
        if not owners:
            print(f"[notify] ticket {ticket.id}: no active owners found, skipping")
            return

        place = _place(ticket)
        pms = _get_pm_users(ticket, db)
        pm_name = _display_name(pms[0]) if pms else "Property Manager"

        summary = (ticket.description or "").strip()
        summary = summary[:200] + ("…" if len(summary) > 200 else "")

        try:
            amount = f"{CURRENCY}{float(ticket.quote_amount):,.2f}"
        except (TypeError, ValueError):
            amount = "see attached quote PDF in the portal"

        link = _app_link(ticket, db, "/owner/approvals")
        subject = f"Quote Ready for Approval — {place}"

        for owner in owners:
            body = f"""
Hi {_display_name(owner)},

A quote is ready for your approval.

Property        : {place}
Property Manager: {pm_name}
Issue           : {summary or "-"}
Quote amount    : {amount}

Approve here:
{link}

Regards,
Property Portal Team
"""
            await _send(owner.email, subject, body)
    except Exception as exc:
        print(f"[notify] notify_quote_submitted error: {exc}")
        traceback.print_exc()


async def maybe_notify_quote_submitted(ticket, db, old_status):
    """Call after a status change is committed. Emails owners only if the
    ticket just moved INTO 'Pending Owner Approval'."""
    if old_status != ticket.status and ticket.status == PENDING_OWNER_APPROVAL:
        await notify_quote_submitted(ticket, db)

async def notify_ticket_closed(ticket, db):
    """Tell the tenant their ticket is closed and invite a rating. Never raises."""
    try:
        tenant = (
            db.query(User).filter(User.username == ticket.created_by).first()
            if ticket.created_by else None
        )
        if not tenant or tenant.role != ROLE_TENANT:
            print(f"[notify] ticket {ticket.id}: not raised by a tenant, skipping closed email")
            return

        place = _place(ticket)
        link = _app_link(ticket, db, f"/tenant/maintenance/{ticket.id}")
        subject = f"Maintenance Request Closed - {place}"
        body = f"""
Hi {_display_name(tenant)},

Your maintenance request has been completed and closed.

Property : {place}
Category : {ticket.category or "-"}
Issue    : {(ticket.description or "-")[:200]}

How did we do? Please rate the work:
{link}

Regards,
Property Portal Team
"""
        await _send(tenant.email, subject, body)
    except Exception as exc:
        print(f"[notify] notify_ticket_closed error: {exc}")
        traceback.print_exc()


async def maybe_notify_ticket_closed(ticket, db, old_status):
    """Call after a status change is committed. Emails only on the move INTO 'closed'."""
    if old_status != ticket.status and ticket.status == "closed":
        await notify_ticket_closed(ticket, db)

async def notify_quote_received_pm(ticket, db, vendor_name: str):
    """Tell the ticket's PM(s) a vendor just uploaded a quote. Never raises."""
    try:
        pms = _get_pm_users(ticket, db)
        if not pms:
            print(f"[notify] ticket {ticket.id}: no PM found, skipping quote-received email")
            return

        place = _place(ticket)
        try:
            amount = f"{float(ticket.quote_amount):,.2f}"
        except (TypeError, ValueError):
            amount = "see attached PDF"

        link = _app_link(ticket, db, f"/pm/tickets/{ticket.id}")
        subject = f"Quote Received - {place}"
        for pm in pms:
            body = f"""
Hi {_display_name(pm)},

{vendor_name} has uploaded a quote.

Property     : {place}
Category     : {ticket.category or "-"}
Quote amount : {amount}

Review the quote:
{link}

Regards,
Property Portal Team
"""
            await _send(pm.email, subject, body)
    except Exception as exc:
        print(f"[notify] notify_quote_received_pm error: {exc}")
        traceback.print_exc()

async def notify_quote_rejected_pm(ticket, db, owner_name: str, reason: str):
    """Tell the assigned PM(s) the owner rejected the quote, with the reason."""
    try:
        for pm in _get_pm_users(ticket, db):
            if not getattr(pm, "email", None):
                continue
            await _send(
                pm.email,
                f"Owner rejected the quote: {_place(ticket)}",
                (
                    f"Hi {_display_name(pm)},\n\n"
                    f"{owner_name} rejected the quote for {_place(ticket)}.\n\n"
                    f"Reason: {reason}\n\n"
                    f"You can request a revised quote from the vendor here:\n"
                    f"{_app_link(ticket, db, f'/pm/tickets/{ticket.id}')}\n"
                ),
            )
    except Exception as exc:       # never let an email problem break the reject action
        print(f"[notify] rejection email failed for ticket {ticket.id}: {exc}")


def _vendor_link(ticket, vendor, db) -> str:
    """Vendor with a login -> portal login then the job page.
    Directory-only vendor -> a valid token link (reuse unexpired, else mint)."""
    if vendor.user_id:
        return _app_link(ticket, db, f"/vendor/jobs/{ticket.id}")

    access = (
        db.query(VendorTicketAccess)
        .filter(VendorTicketAccess.ticket_id == ticket.id,
                VendorTicketAccess.vendor_id == vendor.id)
        .order_by(VendorTicketAccess.expires_at.desc())
        .first()
    )
    if not access or is_token_expired(access.expires_at):
        token, expires_at = create_vendor_access_token()
        access = VendorTicketAccess(token=token, vendor_id=vendor.id,
                                    ticket_id=ticket.id, expires_at=expires_at,
                                    created_by="system")
        db.add(access)
        db.commit()
    return f"{_frontend_url()}/vendor-access/{access.token}"


async def notify_vendor_requote(ticket, db):
    """Tell the assigned vendor the quote was rejected and a revised one is wanted."""
    try:
        if not ticket.assigned_vendor_id:
            print(f"[notify] ticket {ticket.id}: no vendor assigned, skipping re-quote email")
            return
        vendor = db.query(Vendor).filter(Vendor.id == ticket.assigned_vendor_id).first()
        if not vendor or not vendor.email:
            print(f"[notify] ticket {ticket.id}: vendor has no email, skipping re-quote email")
            return

        place = _place(ticket)
        link = _vendor_link(ticket, vendor, db)
        subject = f"Revised Quote Requested — {place}"
        body = f"""
Hi {vendor.name},

Your previous quote for this job was not approved. Please review the
latest comments and submit a revised quote.

Property : {place}
Category : {ticket.category or "-"}
Issue    : {(ticket.description or "-")[:200]}

Submit your revised quote:
{link}

Regards,
Property Portal Team
"""
        await _send(vendor.email, subject, body)
    except Exception as exc:
        print(f"[notify] notify_vendor_requote error: {exc}")
        traceback.print_exc()


async def maybe_notify_vendor_requote(ticket, db, old_status):
    """Only on rejected -> quote_requested (first assignment already has its own email)."""
    if old_status == "rejected" and ticket.status == "quote_requested":
        await notify_vendor_requote(ticket, db)