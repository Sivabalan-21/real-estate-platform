import asyncio
import os
import secrets
import traceback
from urllib.parse import quote

from models import User, PropertyAssignment, Company, Vendor, VendorTicketAccess, TicketComment
from rbac import ROLE_OWNER, ROLE_TENANT
from ticket_states import PENDING_OWNER_APPROVAL
from tokens import create_vendor_access_token, is_token_expired

UNSUBSCRIBE_NOTE = "To stop receiving updates, contact your property manager."
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


def _get_tenant(ticket, db):
    """The tenant who raised the ticket, or None if a PM/owner raised it."""
    if not ticket.created_by:
        return None
    user = db.query(User).filter(User.username == ticket.created_by).first()
    return user if user and user.role == ROLE_TENANT else None


def _unit_label(ticket) -> str:
    return str(ticket.unit.unit_number) if ticket.unit else "-"


def _property_label(ticket) -> str:
    return ticket.property.name if ticket.property else "Property"


def _category_label(ticket) -> str:
    return (ticket.category or "Maintenance").strip() or "Maintenance"


def _ensure_rating_token(ticket, db) -> str:
    """Reuse the ticket's rating token, minting one on first use."""
    if not ticket.rating_token:
        ticket.rating_token = secrets.token_urlsafe(24)
        db.add(ticket)
        db.commit()
    return ticket.rating_token


def _resolution_note(ticket, db) -> str:
    """Last non-tenant comment visible to everyone; falls back to the
    resolution note the PM typed when closing."""
    comment = (
        db.query(TicketComment)
        .filter(
            TicketComment.ticket_id == ticket.id,
            TicketComment.visible_to == "all",
            TicketComment.author_role != ROLE_TENANT,
        )
        .order_by(TicketComment.created_at.desc())
        .first()
    )
    if comment and (comment.body or "").strip():
        return comment.body.strip()
    return (ticket.resolution_note or "").strip() or "-"


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

async def notify_owner_decision(ticket, decision, comment, db):
    """Tell the ticket's PM(s) the owner approved or rejected. Never raises.

    `decision` is "approved" or "rejected" (any casing).
    """
    try:
        decision_label = "Approved" if str(decision).lower().startswith("approv") else "Rejected"
        pms = _get_pm_users(ticket, db)
        if not pms:
            print(f"[notify] ticket {ticket.id}: no PM found, skipping owner-decision email")
            return

        link = _app_link(ticket, db, f"/pm/tickets/{ticket.id}")
        subject = f"Owner {decision_label} — {_property_label(ticket)} Unit {_unit_label(ticket)}"
        owner_comment = (comment or "").strip() or "(no comment)"

        if decision_label == "Rejected":
            next_step = "\nNext step: get a revised quote or contact the owner.\n"
        else:
            next_step = ""

        for pm in pms:
            body = f"""
Hi {_display_name(pm)},

The owner has {decision_label.lower()} the quote for this request.

Property : {_place(ticket)}
Category : {ticket.category or "-"}
Decision : {decision_label}
Owner's comment : {owner_comment}
{next_step}
View the ticket:
{link}

Regards,
Property Portal Team
"""
            await _send(pm.email, subject, body)
    except Exception as exc:
        print(f"[notify] notify_owner_decision error: {exc}")
        traceback.print_exc()


async def notify_ticket_closed(ticket, db):
    """Tell the tenant their ticket is resolved and invite a rating. Never raises."""
    try:
        tenant = _get_tenant(ticket, db)
        if not tenant:
            print(f"[notify] ticket {ticket.id}: not raised by a tenant, skipping closed email")
            return

        token = _ensure_rating_token(ticket, db)
        rate_link = f"{_frontend_url()}/rate/{token}"
        subject = f"Your maintenance request has been resolved — {_category_label(ticket)}"
        body = f"""
Hi {_display_name(tenant)},

Your maintenance request has been resolved and closed.

Property   : {_place(ticket)}
Category   : {ticket.category or "-"}
Your issue : {(ticket.description or "-")[:200]}
Resolution : {_resolution_note(ticket, db)}

How did we do? Please rate the work:
{rate_link}

{UNSUBSCRIBE_NOTE}

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


# Statuses that get the brief generic tenant update. "closed" has its own
# richer email above, so it is deliberately not listed here.
TENANT_UPDATE_STATUSES = {"in_progress": "In Progress", "completed": "Completed"}

_STATUS_FOLLOW_UP = {
    "in_progress": "We'll notify you when it's complete.",
    "completed": "We'll let you know once it has been closed.",
}


async def notify_ticket_status_update(ticket, new_status, db):
    """Brief status email to the tenant. Never raises."""
    try:
        tenant = _get_tenant(ticket, db)
        if not tenant:
            print(f"[notify] ticket {ticket.id}: not raised by a tenant, skipping status update")
            return

        label = TENANT_UPDATE_STATUSES.get(new_status) or str(new_status).replace("_", " ").title()
        follow_up = _STATUS_FOLLOW_UP.get(new_status, "")
        link = _app_link(ticket, db, f"/tenant/maintenance/{ticket.id}")
        subject = f"Update on your request — {_category_label(ticket)}"
        body = f"""
Hi {_display_name(tenant)},

Your request is now {label}. {follow_up}

Property : {_place(ticket)}
Track it here:
{link}

{UNSUBSCRIBE_NOTE}

Regards,
Property Portal Team
"""
        await _send(tenant.email, subject, body)
    except Exception as exc:
        print(f"[notify] notify_ticket_status_update error: {exc}")
        traceback.print_exc()


async def maybe_notify_ticket_status_update(ticket, db, old_status):
    """Call after a status change is committed. Emails the tenant on the move
    INTO 'in_progress' or 'completed'."""
    if old_status != ticket.status and ticket.status in TENANT_UPDATE_STATUSES:
        await notify_ticket_status_update(ticket, ticket.status, db)


async def notify_vendor_invoice_request(ticket, db):
    """Tell the assigned vendor the job is marked Completed and ask for the
    PDF invoice (the PM cannot close the ticket until it is uploaded). Never raises."""
    try:
        if not ticket.assigned_vendor_id:
            print(f"[notify] ticket {ticket.id}: no vendor assigned, skipping invoice request")
            return
        vendor = db.query(Vendor).filter(Vendor.id == ticket.assigned_vendor_id).first()
        if not vendor or not vendor.email:
            print(f"[notify] ticket {ticket.id}: vendor has no email, skipping invoice request")
            return

        place = _place(ticket)
        link = _vendor_link(ticket, vendor, db)
        subject = f"Job completed - please submit your invoice — {place}"
        body = f"""
Hi {vendor.name},

This job has been marked as completed. Please upload your invoice (PDF)
so we can close the ticket.

Property : {place}
Category : {ticket.category or "-"}
Issue    : {(ticket.description or "-")[:200]}

Upload your invoice:
{link}

Regards,
Property Portal Team
"""
        await _send(vendor.email, subject, body)
    except Exception as exc:
        print(f"[notify] notify_vendor_invoice_request error: {exc}")
        traceback.print_exc()


async def maybe_notify_vendor_invoice_request(ticket, db, old_status):
    """Call after a status change is committed. Emails the vendor on the move INTO 'completed'."""
    if old_status != ticket.status and ticket.status == "completed":
        await notify_vendor_invoice_request(ticket, db)


async def notify_invoice_received_pm(ticket, db, vendor_name: str):
    """Tell the ticket's PM(s) the vendor uploaded their invoice, so the
    ticket can now be closed. Never raises."""
    try:
        pms = _get_pm_users(ticket, db)
        if not pms:
            print(f"[notify] ticket {ticket.id}: no PM found, skipping invoice-received email")
            return

        place = _place(ticket)
        link = _app_link(ticket, db, f"/pm/tickets/{ticket.id}")
        subject = f"Invoice Received - {place}"
        for pm in pms:
            body = f"""
Hi {_display_name(pm)},

{vendor_name} has uploaded their invoice. The ticket is ready to be closed.

Property : {place}
Category : {ticket.category or "-"}

Review the invoice and close the ticket:
{link}

Regards,
Property Portal Team
"""
            await _send(pm.email, subject, body)
    except Exception as exc:
        print(f"[notify] notify_invoice_received_pm error: {exc}")
        traceback.print_exc()


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
    """Kept for backwards compatibility; delegates to notify_owner_decision."""
    await notify_owner_decision(ticket, "rejected", reason, db)


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