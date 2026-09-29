import secrets
from datetime import datetime, timedelta, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from app.database import Base  # ADAPT: your Base import


def _expiry():
    return datetime.now(timezone.utc) + timedelta(days=7)


class VendorTicketAccess(Base):
    __tablename__ = "vendor_ticket_access"

    id = Column(Integer, primary_key=True)
    token = Column(String(64), unique=True, index=True, nullable=False,
                   default=lambda: secrets.token_urlsafe(32))
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, default=_expiry)
    revoked = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True),
                        default=lambda: datetime.now(timezone.utc))