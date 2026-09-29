"""Vendor login <-> vendor profile resolution.

A portal login (User, role "Vendor") acts for exactly one Vendor profile,
linked by vendors.user_id. Profiles created before that column existed (or
before the login was registered) are linked lazily on first use by matching
company + email, so nothing depends on a one-off backfill.
"""
from sqlalchemy import func
from sqlalchemy.orm import Session

from models import User, Vendor


def link_vendor_by_email(db: Session, user: User) -> Vendor | None:
    """Attach an unlinked, same-company vendor profile with the user's email.

    Does not commit; the caller owns the transaction.
    """
    if not user.email or not user.company_id:
        return None
    vendor = (
        db.query(Vendor)
        .filter(
            Vendor.company_id == user.company_id,
            Vendor.user_id.is_(None),
            func.lower(Vendor.email) == user.email.strip().lower(),
        )
        .order_by(Vendor.created_at, Vendor.id)
        .first()
    )
    if vendor:
        vendor.user_id = user.id
    return vendor


def get_vendor_for_user(db: Session, user: User) -> Vendor | None:
    """The vendor profile this login acts for, or None if there isn't one."""
    vendor = db.query(Vendor).filter(Vendor.user_id == user.id).first()
    if vendor:
        return vendor
    vendor = link_vendor_by_email(db, user)
    if vendor:
        db.commit()
        db.refresh(vendor)
    return vendor
