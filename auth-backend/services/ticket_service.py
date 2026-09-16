"""Ticket lifecycle operations shared by all ticket update endpoints."""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import MaintenanceTicket, TicketHistory, User
from rbac import ROLE_TENANT
from ticket_states import TICKET_STATES, allowed_next_statuses, canonicalize_ticket_status


def transition_ticket(
    db: Session,
    ticket: MaintenanceTicket,
    new_status: str,
    user: User,
    note: str | None = None,
) -> MaintenanceTicket:
    """Apply one authorised lifecycle transition and append its audit row.

    The caller owns the transaction.  This lets a legacy ticket update also
    change non-status fields atomically with the state transition.
    """
    if user.role == ROLE_TENANT:
        raise HTTPException(403, "Tenants cannot transition tickets")

    current_status = canonicalize_ticket_status(ticket.status)
    if current_status not in TICKET_STATES or new_status not in TICKET_STATES:
        raise HTTPException(400, "Transition not allowed for role")

    if new_status not in allowed_next_statuses(current_status, user.role):
        raise HTTPException(400, "Transition not allowed for role")

    previous_status = ticket.status
    ticket.status = new_status
    ticket.updated_at = datetime.utcnow()
    ticket.closed_at = datetime.utcnow() if new_status == "closed" else None
    db.add(TicketHistory(
        ticket_id=ticket.id,
        from_status=previous_status,
        to_status=new_status,
        changed_by=user.username,
        note=(note or "").strip() or None,
    ))
    return ticket
