from datetime import datetime
import random
import re
import string

import bcrypt
from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import Company, User
from rbac import (
    ROLE_COMPANY_ADMIN,
    ROLE_SUPER_ADMIN,
    USER_STATUSES,
    can_assign_role,
    can_create,
    is_super_admin,
    is_valid_role,
)
from tokens import create_invite_token, create_reset_token, is_token_expired


# ── Company code + slug helpers ───────────────────────────────────────────────

def _make_company_code(db: Session, name: str) -> str:
    """Generate a unique code like PROP-4821.
    Uses the first 4 alphabetic characters of the name (uppercased).
    Retries up to 10 times to guarantee uniqueness."""
    prefix = re.sub(r"[^A-Za-z]", "", name)[:4].upper() or "COMP"
    for _ in range(10):
        digits = "".join(random.choices(string.digits, k=4))
        code = f"{prefix}-{digits}"
        if not db.query(Company).filter(Company.company_code == code).first():
            return code
    raise HTTPException(500, "Could not generate a unique company code")


def _make_slug(db: Session, name: str) -> str:
    """Convert company name to a URL-safe slug, e.g. 'PropTech Solutions' -> 'proptech-solutions'.
    Appends a short random suffix if the slug is already taken."""
    base = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    if not db.query(Company).filter(Company.slug == base).first():
        return base
    for _ in range(10):
        suffix = "".join(random.choices(string.digits, k=4))
        slug = f"{base}-{suffix}"
        if not db.query(Company).filter(Company.slug == slug).first():
            return slug
    raise HTTPException(500, "Could not generate a unique company slug")


def serialize_user(user: User):
    return {
        "id": user.id,
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "company_id": user.company_id,
        "company_name": user.company.name if user.company else None,
        "company_code": user.company.company_code if user.company else None,
        "company_slug": user.company.slug if user.company else None,
        "status": user.status,
        "created_by": user.created_by,
        "updated_by": user.updated_by,
        "max_units": user.max_units,
        "used_units": user.used_units,
        "created_at": str(user.created_at) if user.created_at else None,
        "updated_at": str(user.updated_at) if user.updated_at else None,
    }


def get_current_user(db: Session, token_payload: dict):
    username = token_payload.get("sub")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(401, "User no longer exists")
    if user.status == "suspended":
        raise HTTPException(403, "Your account has been suspended")
    return user


def get_or_create_company(db: Session, name: str):
    company_name = name.strip()
    if not company_name:
        raise HTTPException(400, "Company name is required")

    company = db.query(Company).filter(Company.name == company_name).first()
    if company:
        return company

    slug = (
    company_name
    .strip()
    .lower()
    .replace(" ", "-")
)
    company_code=_make_company_code(db, company_name)

    company = Company(
    name=company_name,
    slug=slug,
    company_code=company_code
)
    db.add(company)
    # flush + refresh guarantees company.id (and code/slug) are populated
    # before we assign company_id to the user in the same transaction.
    db.flush()
    db.refresh(company)
    return company


def backfill_companies(db: Session):
    companies = db.query(Company).all()

    fixed = 0
    for company in companies:
        needs_code = not company.company_code  # catches None AND empty string
        needs_slug = (
            not company.slug or
            " " in company.slug or
            company.slug != company.slug.lower()
        )

        if needs_code:
            company.company_code = _make_company_code(db, company.name)
        if needs_slug:
            clean = re.sub(r"[^a-z0-9]+", "-", company.name.strip().lower()).strip("-")
            company.slug = clean
            fixed += 1

        if needs_code:  # count separately
            fixed += 1

    if fixed:
        db.commit()
        print(f"[startup] Backfilled slug/code for {fixed} company(s)")


def get_company_for_new_user(db: Session, current_user: User, data):
    if is_super_admin(current_user.role):
        if data.role == ROLE_COMPANY_ADMIN:
            return None

        company = None

        if data.company_id:
            company = db.query(Company).filter(
                Company.id == data.company_id
            ).first()

            if not company:
                raise HTTPException(
                    status_code=404,
                    detail="Company not found"
                )

            return company

        raise HTTPException(400, "Company selection is required")

    if not current_user.company_id:
        raise HTTPException(403, "Current user is not assigned to a company")

    return current_user.company


def assert_same_company_or_super_admin(current_user: User, target_user: User):
    if is_super_admin(current_user.role):
        return

    if not current_user.company_id or current_user.company_id != target_user.company_id:
        raise HTTPException(403, "Cross-company access denied")


def can_manage_user(current_user: User, target_user: User):
    if target_user.role == ROLE_SUPER_ADMIN and current_user.role != ROLE_SUPER_ADMIN:
        return False

    if is_super_admin(current_user.role):
        return target_user.role != ROLE_SUPER_ADMIN

    if target_user.role in [ROLE_SUPER_ADMIN, ROLE_COMPANY_ADMIN]:
        return False

    return target_user.created_by == current_user.username or can_create(current_user.role, target_user.role)


def assert_can_manage_user(current_user: User, target_user: User):
    assert_same_company_or_super_admin(current_user, target_user)
    if not can_manage_user(current_user, target_user):
        raise HTTPException(403, "Not allowed to manage this user")


def create_user(db: Session, current_user: User, data):
    email = data.email.strip().lower()

    if not is_valid_role(data.role) or data.role == ROLE_SUPER_ADMIN:
        raise HTTPException(400, "Invalid role")

    if not can_create(current_user.role, data.role):
        raise HTTPException(403, "Not allowed to create this role")

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, "Email already exists")

    if data.username and db.query(User).filter(User.username == data.username).first():
        raise HTTPException(400, "Username already exists")


    company = get_company_for_new_user(db, current_user, data)
    token, expiry = create_invite_token()

    user = User(
        username=data.username,
        email=email,
        password=None,
        role=data.role,
        company_id=company.id if company else None,
        status="invited",
        reset_token=token,
        token_type="invite",
        token_expiry=expiry,
        created_by=current_user.username,
        updated_by=current_user.username,
        max_units=data.units,
        used_units=0,
    )

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def visible_users(db: Session, current_user: User):
    query = db.query(User).filter(User.role != ROLE_SUPER_ADMIN)

    if not is_super_admin(current_user.role):
        query = query.filter(User.company_id == current_user.company_id)

    return query.order_by(User.created_at.desc()).all()


def update_user(db: Session, current_user: User, target_username: str, data):
    target = db.query(User).filter(User.username == target_username).first()
    if not target:
        target = db.query(User).filter(User.id == target_username).first()
    if not target:
        raise HTTPException(404, "User not found")

    assert_can_manage_user(current_user, target)

    if data.role is not None:
        if not can_assign_role(current_user.role, data.role):
            raise HTTPException(403, "Not allowed to assign this role")
        target.role = data.role

    if data.status is not None:
        if data.status not in USER_STATUSES:
            raise HTTPException(400, "Invalid status")
        target.status = data.status

    if data.email is not None:
        email = data.email.strip().lower()
        existing = db.query(User).filter(User.email == email, User.id != target.id).first()
        if existing:
            raise HTTPException(400, "Email already in use")
        target.email = email

    if data.company_id is not None:
        if not is_super_admin(current_user.role):
            raise HTTPException(403, "Only Super Admin can move users between companies")
        company = db.query(Company).filter(Company.id == data.company_id).first()
        if not company:
            raise HTTPException(404, "Company not found")
        target.company_id = company.id

    if data.send_reset:
        token, expiry = create_reset_token()
        target.reset_token = token
        target.token_type = "reset"
        target.token_expiry = expiry

    target.updated_by = current_user.username
    target.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(target)
    return target


def delete_user(db: Session, current_user: User, user_id: str):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # Auth check FIRST — prevent leaking info to unauthorized callers
    assert_can_manage_user(current_user, target)

    # Prevent deleting a registered Company Admin while company still has users
    if (
    target.role == ROLE_COMPANY_ADMIN
    and target.status != "invited"
    and target.company_id
):

        child_users = db.query(User).filter(
        User.company_id == target.company_id,
        User.id != target.id,
        User.role != ROLE_COMPANY_ADMIN,
        User.status == "active"
    ).count()

        if child_users > 0:
            raise HTTPException(
            status_code=400,
            detail="Cannot delete Company Admin while company users exist"
        )

        company = db.query(Company).filter(
        Company.id == target.company_id
    ).first()

        if company:
            db.delete(company)
    db.delete(target)
    db.commit()

    return {"message": "User deleted successfully"}


def resend_invite(db: Session, current_user: User, user_id: str):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found")

    assert_can_manage_user(current_user, target)

    if target.status != "invited":
        raise HTTPException(400, "Registration link can only be resent for invited users")

    token, expiry = create_invite_token()
    target.reset_token = token
    target.token_type = "invite"
    target.token_expiry = expiry
    target.updated_by = current_user.username
    target.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(target)
    return target


def get_invite_user(db: Session, token: str):
    user = db.query(User).filter(
        User.reset_token == token,
        User.token_type == "invite",
        User.status == "invited",
    ).first()

    if not user or is_token_expired(user.token_expiry):
        raise HTTPException(400, "Invalid or expired invite link")

    return user


def complete_registration(db: Session, token: str, data: dict):
    user = get_invite_user(db, token)

    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        raise HTTPException(400, "Username and password are required")

    if db.query(User).filter(User.username == username, User.id != user.id).first():
        raise HTTPException(400, "Username already taken")

    if user.role == ROLE_COMPANY_ADMIN and not user.company_id:
        company_name = data.get("company_name", "").strip()

        if not company_name:
            raise HTTPException(400, "Company name is required")

        # Create the company within this transaction; flush+refresh ensures
        # company.id is populated before we assign it to the user.
        company = get_or_create_company(db, company_name)
        user.company_id = company.id

    user.username = username
    user.password = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user.full_name = data.get("full_name", "").strip() or None   # ← add
    user.phone     = data.get("phone",     "").strip() or None   # ← add
    user.status = "active"
    user.reset_token = None
    user.token_type = None
    user.token_expiry = None
    user.updated_at = datetime.utcnow()
    

    # Commit persists both the new Company row and the updated user.company_id
    # in a single transaction — either both succeed or both roll back.
    db.commit()

    # Re-query instead of refresh so SQLAlchemy eagerly loads the .company
    # relationship. A plain db.refresh(user) only reloads scalar columns and
    # leaves lazy-loaded relationships pointing at the expired identity map,
    # which causes user.company to return None in the calling route handler.
    user = db.query(User).filter(User.id == user.id).first()

    return user


def reset_password(db: Session, token: str, new_password: str):
    user = db.query(User).filter(
        User.reset_token == token,
        User.token_type == "reset",
    ).first()

    if not user or is_token_expired(user.token_expiry):
        raise HTTPException(400, "Invalid or expired reset token")

    user.password = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    user.reset_token = None
    user.token_type = None
    user.token_expiry = None
    user.updated_at = datetime.utcnow()

    db.commit()
    return user