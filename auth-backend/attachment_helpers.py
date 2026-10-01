from fastapi import HTTPException
from sqlalchemy import func

from models import TicketAttachment

MAX_FILE_BYTES = 10 * 1024 * 1024      # 10 MB per file
MAX_TICKET_BYTES = 20 * 1024 * 1024    # 20 MB per ticket

GROUP_OF = {
    "photo": "photos",
    "quote": "quotes",
    "invoice": "invoices",
    "pm_note": "pm_notes",
}

VISIBLE_GROUPS = {
    "pm": {"photos", "quotes", "invoices", "pm_notes"},
    "owner": {"quotes"},                       # owners only ever see quotes
    "vendor": {"photos", "quotes", "invoices"},
    "tenant": {"photos"},
}


def role_key(role) -> str:
    """Normalise whatever ROLE_* string you use into owner/tenant/vendor/pm."""
    r = str(role or "").lower()
    if "owner" in r:
        return "owner"
    if "tenant" in r:
        return "tenant"
    if "vendor" in r:
        return "vendor"
    return "pm"


def check_file_size(data: bytes):
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(400, "File too large (max 10MB)")


def check_ticket_total(db, ticket_id: str, new_bytes: int):
    existing_kb = (
        db.query(func.coalesce(func.sum(TicketAttachment.size_kb), 0))
        .filter(TicketAttachment.ticket_id == ticket_id)
        .scalar()
        or 0
    )
    if existing_kb * 1024 + new_bytes > MAX_TICKET_BYTES:
        raise HTTPException(400, "Ticket attachment limit exceeded (max 20MB total per ticket)")


def to_kb(size_bytes: int) -> int:
    return max(1, -(-size_bytes // 1024))  # round up


def next_quote_version(db, ticket_id: str) -> int:
    current = (
        db.query(func.coalesce(func.max(TicketAttachment.version), 0))
        .filter(TicketAttachment.ticket_id == ticket_id, TicketAttachment.type == "quote")
        .scalar()
        or 0
    )
    return current + 1


def _item(a):
    return {
        "id": a.id,
        "url": a.url,
        "filename": a.filename,
        "uploaded_by_role": a.uploaded_by_role,
        "uploaded_at": a.uploaded_at,
        "size_kb": a.size_kb or 0,
        "version": a.version or 0,
    }


def group_attachments(rows, role) -> dict:
    allowed = VISIBLE_GROUPS[role_key(role)]
    out = {"photos": [], "quotes": [], "invoices": [], "pm_notes": []}

    quote_idx = 0
    for a in sorted(rows, key=lambda r: r.uploaded_at):   # oldest first
        group = GROUP_OF.get(str(a.type).lower())
        if group is None:
            continue
        if group == "quotes":
            quote_idx += 1            # old rows without a stored version still get v1, v2...
        if group not in allowed:
            continue
        item = _item(a)
        if group == "quotes":
            item["version"] = a.version or quote_idx
        out[group].append(item)

    for g in out:                      # newest first in every tab
        out[g].reverse()
    return out