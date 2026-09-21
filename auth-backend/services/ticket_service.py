"""Ticket lifecycle operations shared by all ticket update endpoints."""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import MaintenanceTicket, TicketHistory, Unit, User
from rbac import ROLE_TENANT
from ticket_states import TICKET_STATES, allowed_next_statuses, canonicalize_ticket_status

# Both are terminal (see ticket_states.py) -- neither leaves work pending on
# the unit, so both trigger the maintenance-status revert below.
TERMINAL_TICKET_STATUSES = ("closed", "rejected")


def sync_unit_status_to_maintenance(db: Session, ticket: MaintenanceTicket) -> None:
    """Flip a newly-opened ticket's unit to "maintenance", remembering its
    prior status so sync_unit_status_from_ticket_resolution can restore it
    later.

    No-op if the ticket isn't tied to a specific unit, or if the unit is
    already "maintenance" -- covers both a second concurrent ticket opening
    on the same unit (don't clobber the already-stored prior status with
    "maintenance" itself) and a unit a PM already marked under repair by
    hand before this ticket existed.
    """
    if not ticket.unit_id:
        return
    unit = db.query(Unit).filter(Unit.id == ticket.unit_id).first()
    if not unit or unit.status == "maintenance":
        return
    unit.pre_maintenance_status = unit.status
    unit.status = "maintenance"
    db.add(unit)


def sync_unit_status_from_ticket_resolution(db: Session, ticket: MaintenanceTicket) -> None:
    """Restore a resolved ticket's unit out of "maintenance" -- but only if
    no OTHER open ticket on the same unit is still in play, so multiple
    concurrent tickets on one unit don't clear the flag until the last one
    resolves.

    No-op if the ticket isn't tied to a unit, or if the unit isn't currently
    flagged "maintenance" (e.g. a PM had already changed it by hand).
    """
    if not ticket.unit_id:
        return
    unit = db.query(Unit).filter(Unit.id == ticket.unit_id).first()
    if not unit or unit.status != "maintenance":
        return

    other_open = (
        db.query(MaintenanceTicket)
        .filter(
            MaintenanceTicket.unit_id == ticket.unit_id,
            MaintenanceTicket.id != ticket.id,
            MaintenanceTicket.status.notin_(TERMINAL_TICKET_STATUSES),
        )
        .first()
    )
    if other_open:
        return

    unit.status = unit.pre_maintenance_status or "vacant"
    unit.pre_maintenance_status = None
    db.add(unit)


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

    if new_status in TERMINAL_TICKET_STATUSES:
        sync_unit_status_from_ticket_resolution(db, ticket)

    return ticket