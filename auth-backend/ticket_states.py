"""Canonical maintenance-ticket lifecycle (Month 2 / Day 24 full state machine).

Ten canonical states covering the full PM -> vendor-quote -> owner-approval
-> completion workflow. Quote-request and vendor-assignment features land
later in Month 2 and will call `transition_ticket()` directly (see
services/ticket_service.py) to move a ticket through `quote_requested` /
`quote_received` without going through the API — this module only defines
which moves are legal, and for whom.
"""
from rbac import (
    ROLE_ADMIN,
    ROLE_COMPANY_ADMIN,
    ROLE_OWNER,
    ROLE_PROPERTY_MANAGER,
    ROLE_SUPER_ADMIN,
)

TICKET_STATES = (
    "open",
    "pm_review",
    "quote_requested",
    "quote_received",
    "pending_owner_approval",
    "approved",
    "in_progress",
    "completed",
    "closed",
    "rejected",
)

TICKET_STATE_LABELS = {
    "open": "Open",
    "pm_review": "PM Review",
    "quote_requested": "Quote Requested",
    "quote_received": "Quote Received",
    "pending_owner_approval": "Pending Owner Approval",
    "approved": "Approved",
    "in_progress": "In Progress",
    "completed": "Completed",
    "closed": "Closed",
    "rejected": "Rejected",
}

# Kept as a separate name since main.py imports it under this name for
# list/filter endpoints; it's just the same tuple of valid states.
TICKET_STATUS_FILTERS = TICKET_STATES

# main.py's owner-approval badge logic (get_owner_tickets /
# serialize_owner_ticket) imports this — it's now a real, reachable
# workflow state rather than a Day 18 placeholder.
PENDING_OWNER_APPROVAL = "pending_owner_approval"

# PM (and the admin tiers, who can do anything a PM can) drive the ticket
# from creation through vendor quoting and, once approved, through to
# completion. "closed" and "rejected" are terminal — neither has an entry
# below, so no role can transition out of them.
_PM_TRANSITIONS = {
    "open": {"pm_review"},
    "pm_review": {"quote_requested"},
    "quote_requested": {"quote_received"},
    "quote_received": {"pending_owner_approval"},
    "approved": {"in_progress"},
    "in_progress": {"completed"},
    "completed": {"closed"},
}

# Owner's only move in the lifecycle: decide on a ticket a PM has sent up
# for approval. Every other stage is out of scope for this role.
_OWNER_TRANSITIONS = {
    "pending_owner_approval": {"approved", "rejected"},
}

ALLOWED_TRANSITIONS = {
    ROLE_PROPERTY_MANAGER: _PM_TRANSITIONS,
    ROLE_ADMIN: _PM_TRANSITIONS,
    ROLE_COMPANY_ADMIN: _PM_TRANSITIONS,
    ROLE_SUPER_ADMIN: _PM_TRANSITIONS,
    ROLE_OWNER: _OWNER_TRANSITIONS,
}


def allowed_next_statuses(current_status: str, role: str) -> set[str]:
    """Return the legal next statuses for this role/current state."""
    return ALLOWED_TRANSITIONS.get(role, {}).get(current_status, set())


def canonicalize_ticket_status(status: str) -> str:
    """No legacy aliases — status is already canonical."""
    return status