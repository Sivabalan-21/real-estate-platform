import asyncio
import os
import traceback

from models import User, PropertyAssignment
from rbac import ROLE_OWNER
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