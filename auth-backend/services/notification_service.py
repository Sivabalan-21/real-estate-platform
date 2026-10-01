import asyncio
import os
import traceback

from models import User, PropertyAssignment
from rbac import ROLE_OWNER,ROLE_TENANT
from ticket_states import PENDING_OWNER_APPROVAL
print("[notify] notify_ticket_created called, MAIL_SERVER =", os.getenv("MAIL_SERVER"))
CURRENCY = "₹"              # change if your quotes use another currency
SEND_TIMEOUT_SECONDS = 20   # stops a dead mail server from hanging the API


def _frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")


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
        link = f"{_frontend_url()}/pm/tickets/{ticket.id}"
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
            amount = "-"

        link = f"{_frontend_url()}/owner/approvals/{ticket.id}"
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
        link = f"{_frontend_url()}/tenant/maintenance/{ticket.id}"  # TODO: confirm tenant route
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

        link = f"{_frontend_url()}/pm/tickets/{ticket.id}"
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
                    f"{_frontend_url()}/pm/tickets/{ticket.id}\n"
                ),
            )
    except Exception as exc:       # never let an email problem break the reject action
        print(f"[notify] rejection email failed for ticket {ticket.id}: {exc}")