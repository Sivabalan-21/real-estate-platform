from datetime import datetime
import os
import uuid

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, UploadFile, File
from typing import List
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import Base, SessionLocal, engine
from models import Company, User, DimensionType, Property, PropertyDimension, PropertyAssignment, Unit, Lease, UnitPhoto, MaintenanceTicket, TicketAttachment, TicketHistory
from rbac import ROLE_COMPANY_ADMIN, ROLE_PROPERTY_MANAGER, ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_TENANT, ROLE_OWNER, ROLE_HIERARCHY
from schemas import (
    CreateUserRequest,
    LoginRequest,
    ResetPasswordRequest,
    UpdateUserRequest,
    DimensionTypeCreate,
    PropertyCreate,
    PropertyUpdate,
    UnitCreate,
    UnitUpdate,
    UnitResponse,
    AssignRequest,
    LeaseCreate,
    LeaseUpdate,
    MaintenanceTicketCreate,
    MaintenanceTicketUpdate,
    TicketCreate,
)
from services.user_service import (
    backfill_companies,
    complete_registration,
    create_user,
    delete_user,
    get_current_user,
    get_invite_user,
    resend_invite,
    reset_password,
    serialize_user,
    update_user as update_user_service,
    visible_users,
)
from tokens import ALGORITHM, SECRET_KEY, create_access_token, create_reset_token, is_token_expired
import shutil

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
BACKEND_URL = os.getenv("BACKEND_URL", "http://187.127.180.107")

load_dotenv()

app = FastAPI(title="Property Portal API")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
security = HTTPBearer()

conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD"),
    MAIL_FROM=os.getenv("MAIL_FROM"),
    MAIL_PORT=int(os.getenv("MAIL_PORT", "587")),
    MAIL_SERVER=os.getenv("MAIL_SERVER"),
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
)

# REPLACE ✅
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

# Auto-migration: backfill slug + company_code for any companies
# that were created before these columns were added.
# Runs once at startup, skips companies that already have values.
with SessionLocal() as _db:
    backfill_companies(_db)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Invalid token")


def current_user(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    return get_current_user(db, payload)


def verify_password(plain: str, hashed: str):
    return bcrypt.checkpw(plain.encode(), hashed.encode())


async def send_invite_email(email: str, link: str, role: str, username: str):
    subject = f"Welcome - {role} Account Setup"
    body = f"""
Hi {username},

You have been invited as {role}.

Complete your registration using this link:
{link}

This invitation expires in 24 hours.

Regards,
Property Portal Team
"""
    await send_email(email, subject, body)


async def send_reset_email(email: str, link: str, username: str):
    subject = "Password Reset Request"
    body = f"""
Hi {username},

Reset your password using this link:
{link}

This password reset link expires in 30 minutes.

If you did not request this, ignore this email.

Regards,
Property Portal Team
"""
    await send_email(email, subject, body)


async def send_email(email: str, subject: str, body: str):
    message = MessageSchema(
        subject=subject,
        recipients=[email],
        body=body,
        subtype="plain",
        sender=os.getenv("MAIL_FROM", "noreply@example.com"),
    )
    fm = FastMail(conf)
    await fm.send_message(message)

async def send_logo_upload_email(email: str, link: str, username: str, company_name: str):
    subject = "Upload Your Company Logo — PropOS"
    body = f"""
Hi {username},

You have been requested to upload a logo for {company_name}.

Click the link below to upload your company logo:
{link}

This link expires in 30 minutes.

If you did not expect this, ignore this email.

Regards,
Property Portal Team
"""
    await send_email(email, subject, body)


@app.get("/")
def home():
    return {"message": "Backend running"}

@app.post("/auth/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()

    if not user:
        raise HTTPException(400, "Invalid credentials")

    # An invited-but-not-yet-registered user has no password hash at all, so
    # this must be checked before verify_password() — otherwise every such
    # attempt falls into the generic "Invalid credentials" branch below
    # instead of telling the person what's actually going on.
    if user.status == "invited":
        raise HTTPException(403, "Please complete registration before logging in")

    if user.status == "suspended":
        raise HTTPException(403, "Your account has been suspended")

    if not user.password or not verify_password(data.password, user.password):
        raise HTTPException(400, "Invalid credentials")

    if user.role != data.role:
        raise HTTPException(400, "Invalid role")

    # ✅ Company/slug check — must belong to this portal
    if data.slug:
        company = db.query(Company).filter(Company.slug == data.slug).first()
        if not company or user.company_id != company.id:
            raise HTTPException(400, "Invalid credentials")


    token = create_access_token({
        "sub": user.username,
        "role": user.role,
        "company_id": user.company_id,
    })

    return {
        "access_token": token,
        "company_name": user.company.name if user.company else None,
        "company_code": user.company.company_code if user.company else None,
        "company_slug": user.company.slug if user.company else None,
        "role":         user.role,
        "username":     user.username,
        "status":       user.status,
    }


@app.post("/users/create")
async def create_user_route(
    data: CreateUserRequest,
    user = Depends(current_user),   
    db = Depends(get_db),
):
    new_user = create_user(db, user, data)
    register_link = f"{FRONTEND_URL}/register/{new_user.reset_token}"

    try:
        await send_invite_email(
            new_user.email,
            register_link,
            new_user.role,
            new_user.username or new_user.email.split("@")[0],
        )
    except Exception as exc:
        print("INVITE EMAIL ERROR:", exc)


@app.get("/users")
def get_users(db: Session = Depends(get_db)):
    users = db.query(User).all()

    result = []
    for u in users:
        result.append({
            "user_id": u.id,
            "username": u.username,
            "email": u.email,
            "role": u.role,
            "status": u.status,
            "company_id": u.company_id,

            # 🔥 ADD THIS LINE
            "company_name": u.company.name if u.company else None
        })

    return result


@app.get("/users/my-hierarchy", response_model=None)
def get_my_users(
    db = Depends(get_db),                  # 🔥 REMOVE : Session
    user = Depends(current_user)
):
    if user.role == "Super Admin":
        users = db.query(User).filter(
            User.role != "Super Admin"
        ).all()

    elif user.role == "Company Admin":
        users = db.query(User).filter(
            User.company_id == user.company_id,
            User.role.in_(ROLE_HIERARCHY[ROLE_COMPANY_ADMIN]),
        ).all()

    elif user.role == ROLE_ADMIN:
        users = db.query(User).filter(
            User.created_by == user.username,
            User.id != user.id,
        ).all()

    elif user.role == ROLE_PROPERTY_MANAGER:
        # Two sources, unioned: (1) anyone this PM personally created
        # (vendors, owners, tenants they invited themselves), and (2) any
        # tenant living on a property assigned to this PM via
        # PropertyAssignment, regardless of who actually sent the invite —
        # a Company Admin creating a tenant directly (e.g. before a PM was
        # assigned, or for VIP onboarding) shouldn't make that tenant
        # invisible to the PM who's actually responsible for the property.
        created_users = db.query(User).filter(User.created_by == user.username).all()

        assigned_property_ids = [
            row[0] for row in
            db.query(PropertyAssignment.property_id)
            .filter(PropertyAssignment.pm_username == user.username)
            .all()
        ]

        property_tenants = []
        if assigned_property_ids:
            tenant_usernames = [
                row[0] for row in
                db.query(Lease.tenant_username)
                .filter(
                    Lease.property_id.in_(assigned_property_ids),
                    Lease.tenant_username.isnot(None),
                )
                .all()
            ]
            if tenant_usernames:
                property_tenants = db.query(User).filter(User.username.in_(tenant_usernames)).all()

        # Dedupe by id, and defensively drop the PM's own record — a PM
        # should never see themselves in their own "people I manage" list,
        # even if stale/seeded data somehow set created_by to their own
        # username.
        combined = {u.id: u for u in created_users}
        for u in property_tenants:
            combined[u.id] = u
        combined.pop(user.id, None)
        users = list(combined.values())

    else:
        users = []

    result = []
    for u in users:
        result.append({
            "user_id":      u.id,
            "username":     u.username,
            "email":        u.email,
            "role":         u.role,
            "status":       u.status,
            "company_name": u.company.name if u.company else None,
            "company_code": u.company.company_code if u.company else None,
            "company_slug": u.company.slug if u.company else None,
            "company_id":   u.company_id,
            "created_at":   u.created_at,
            "max_units":    u.max_units,
            "used_units":   u.used_units,
        })

    return result


@app.put("/users/update/{username}")
async def update_user_route(
    username: str,
    data: UpdateUserRequest,
    db: Session = Depends(get_db),
    user = Depends(current_user),
):
    # Capture old values before update
    target = db.query(User).filter(
        User.username == username
    ).first()

    old_role = target.role if target else None
    old_status = target.status if target else None

    updated = update_user_service(
        db,
        user,
        username,
        data
    )

    # SEND RESET EMAIL
    if data.send_reset and updated.reset_token:

        reset_link = f"{FRONTEND_URL}/reset-password/{updated.reset_token}"

        try:
            await send_reset_email(
                updated.email,
                reset_link,
                updated.username or updated.email.split("@")[0],
            )
        except Exception as exc:
            print("RESET EMAIL ERROR:", exc)

    # SEND UPDATE EMAIL
    changes = []

    if data.role and data.role != old_role:
        changes.append(
            f"Role: {old_role} → {data.role}"
        )

    if data.status and data.status != old_status:
        changes.append(
            f"Status: {old_status} → {data.status}"
        )

    if changes and updated.email:

        body = f"""
Hi {updated.username},

Your account has been updated by an administrator.

Changes made:
{chr(10).join(f"  • {c}" for c in changes)}

If you have any questions, please contact your administrator.

Regards,
PropOS Team
"""

        try:
            await send_email(
                updated.email,
                "Your account has been updated",
                body
            )

        except Exception as e:
            print("UPDATE EMAIL ERROR:", e)

    return {
        "message": "User updated successfully",
        "user": serialize_user(updated)
    }


@app.delete("/users/delete/{id}")
def delete_user_route(
    id: str,
    user = Depends(current_user),   
    db = Depends(get_db),
):
    delete_user(db, user, id)
    return {"message": "User deleted successfully"}


@app.post("/users/resend-registration/{user_id}")
async def resend_registration_route(
    user_id: str,
    user = Depends(current_user),
    db = Depends(get_db),
):
    invited_user = resend_invite(db, user, user_id)
    register_link = f"http://localhost:3000/register/{invited_user.reset_token}"

    try:
        await send_invite_email(
            invited_user.email,
            register_link,
            invited_user.role,
            invited_user.username or invited_user.email.split("@")[0],
        )
    except Exception as exc:
        print("RESEND INVITE EMAIL ERROR:", exc)


@app.get("/register/{token}")
def get_register_info(token: str, db: Session = Depends(get_db)):
    user = get_invite_user(db, token)
    return {
        "email": user.email,
        "role": user.role,
        "company_id": user.company_id,
        "company_name": user.company.name if user.company else None,
        "company_slug": user.company.slug if user.company else None,
    }


@app.post("/complete-registration/{token}")
async def complete_registration_route(token: str, data: dict, db: Session = Depends(get_db)):
    user = complete_registration(db, token, data)
    company_slug = user.company.slug if user.company else None
    portal_url = f"{FRONTEND_URL}/portal/{company_slug}" if company_slug else FRONTEND_URL

    if user.role == ROLE_TENANT:
        subject = "Welcome to your new home — PropOS"
        welcome_body = f"""
Hi {user.full_name or user.username},

Welcome home! Your tenant portal is ready. From here you can pay rent, submit
maintenance requests, and message your property manager — no more waiting on
hold or chasing down a phone number.

Username : {user.username}
Password : {data.get("password", "")}
Portal   : {portal_url}

Please keep this information safe and do not share your password with anyone.

Best regards,
PropOS Team
"""
    else:
        subject = "Welcome to PropOS — Your Login Details"
        welcome_body = f"""
Hello {user.username},

Your account has been successfully created. Here are your login details:

Username : {user.username}
Password : {data.get("password", "")}
Role     : {user.role}
Portal   : {portal_url}

Please keep this information safe and do not share your password with anyone.

Best regards,
PropOS Team
"""
    # Registration itself (username/password + lease linkage) is already
    # committed at this point — a flaky SMTP server must never turn an
    # already-successful registration into a 500 for the user. Same
    # fail-soft pattern as the invite-email sends above.
    try:
        await send_email(user.email, subject, welcome_body)
    except Exception as exc:
        print("WELCOME EMAIL ERROR:", exc)

    return {
        "message":      "Registration complete",
        "username":     user.username,
        "role":         user.role,
        "company_name": user.company.name if user.company else None,
        "company_code": user.company.company_code if user.company else None,
        "company_slug": company_slug,
    }


@app.get("/auth/validate-token/{token}")
def validate_reset_token(token: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        User.reset_token == token,
        User.token_type == "reset",
    ).first()
    if not user:
        raise HTTPException(400, "Invalid token")
    return {"username": user.username,"company_slug": user.company.slug if user.company else None}


@app.post("/auth/reset-password")
def reset_password_route(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    reset_password(db, data.token, data.new_password)
    return {"message": "Password updated"}


@app.get("/portal/{slug}")
def get_portal_info(slug: str, db: Session = Depends(get_db)):
    """Public endpoint — no auth required.
    Returns branding data for the company's custom login page at /portal/<slug>."""
    company = db.query(Company).filter(Company.slug == slug).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company portal not found")
    return {
        "company_id":   company.id,
        "company_name": company.name,
        "company_code": company.company_code,
        "slug":         company.slug,
        "logo": company.logo
    }

@app.get("/companies")
def get_companies(
    db: Session = Depends(get_db)
):
    company_admins = db.query(User).filter(
        User.role == "Company Admin",
        User.status.ilike("active"),
        User.company_id.isnot(None)
    ).all()

    unique_companies = []

    seen = set()

    for admin in company_admins:

        company = db.query(Company).filter(
            Company.id == admin.company_id
        ).first()

        if not company:
            continue

        normalized = company.name.strip().lower()

        if normalized not in seen:

            seen.add(normalized)

            unique_companies.append({
                "id":           company.id,
                "name":         company.name,
                "company_code": company.company_code,
                "slug":         company.slug,
            })

    return unique_companies

@app.post("/company/upload-logo")
async def upload_logo(
    file: UploadFile = File(...),
    user = Depends(current_user),
    db: Session = Depends(get_db),
):
    if not user.company_id:
        raise HTTPException(400, "No company assigned")

    filename = f"{user.company_id}_{file.filename}"
    filepath = f"uploads/{filename}"

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    company = db.query(Company).filter(
        Company.id == user.company_id
    ).first()

    company.logo = f"{BACKEND_URL}/uploads/{filename}"

    db.commit()

    return {
        "message": "Logo uploaded successfully",
        "logo": company.logo
    }

@app.post("/company/send-logo-upload-link/{username}")
async def send_logo_upload_link(
    username: str,
    db: Session = Depends(get_db),
    user=Depends(current_user)
):
    if user.role != "Super Admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    company_admin = db.query(User).filter(
        User.username == username,
        User.role     == "Company Admin"
    ).first()

    if not company_admin:
        raise HTTPException(status_code=404, detail="Company Admin not found")

    token, expiry = create_reset_token()
    company_admin.reset_token  = token
    company_admin.token_type   = "logo_upload"
    company_admin.token_expiry = expiry
    db.commit()

    company = db.query(Company).filter(Company.id == company_admin.company_id).first()
    upload_link = f"{FRONTEND_URL}/upload-logo/{token}"

    try:
        await send_logo_upload_email(
            company_admin.email,
            upload_link,
            company_admin.username or company_admin.email.split("@")[0],
            company.name if company else "Your Company",
        )
    except Exception as exc:
        print("LOGO EMAIL ERROR:", exc)
        raise HTTPException(status_code=500, detail="Failed to send email")

    return {"message": "Logo upload link sent successfully"}


@app.post("/company/upload-logo-by-token/{token}")
async def upload_logo_by_token(
    token: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # Find user by token
    user = db.query(User).filter(
        User.reset_token == token,
        User.token_type  == "logo_upload",
    ).first()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    if is_token_expired(user.token_expiry):
        raise HTTPException(status_code=400, detail="This link has expired")

    # Save the file
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    ext      = os.path.splitext(file.filename)[1]
    filename = f"company_{user.company_id}{ext}"
    filepath = os.path.join(upload_dir, filename)

    with open(filepath, "wb") as f:
        f.write(await file.read())

    # Update company logo path and clear token
    company = db.query(Company).filter(Company.id == user.company_id).first()
    if company:
        company.logo = f"/uploads/{filename}"
        db.commit()

    user.reset_token  = None
    user.token_type   = None
    user.token_expiry = None
    db.commit()

    return {"message": "Logo uploaded successfully"}

@app.get("/company/validate-logo-token/{token}")
def validate_logo_token(token: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        User.reset_token == token,
        User.token_type  == "logo_upload",
    ).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid token")
    if is_token_expired(user.token_expiry):
        raise HTTPException(status_code=400, detail="Token expired")
    return {"valid": True}

# ---------- DIMENSION TYPES ----------

@app.post("/dimension-types")
def create_dimension_type(
    data: DimensionTypeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role not in (ROLE_ADMIN, ROLE_COMPANY_ADMIN, ROLE_SUPER_ADMIN, ROLE_PROPERTY_MANAGER):
        raise HTTPException(403, "Not authorized to create dimension types")
    if not user.company_id:
        raise HTTPException(400, "User has no associated company")

    existing = db.query(DimensionType).filter(
        DimensionType.company_id == user.company_id,
        DimensionType.name == data.name,
    ).first()
    if existing:
        return existing

    dt = DimensionType(company_id=user.company_id, name=data.name, unit=data.unit)
    db.add(dt)
    db.commit()
    db.refresh(dt)
    return dt


@app.get("/dimension-types")
def get_dimension_types(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if not user.company_id:
        raise HTTPException(400, "User has no associated company")
    return db.query(DimensionType).filter(DimensionType.company_id == user.company_id).all()


# ---------- PROPERTIES ----------

@app.post("/properties")
def create_property(
    data: PropertyCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role not in (
        ROLE_COMPANY_ADMIN,
        ROLE_PROPERTY_MANAGER,
        ROLE_ADMIN,
        ROLE_SUPER_ADMIN,
    ):
        raise HTTPException(
                403,
            "Not authorized to create properties",
        )
    if not user.company_id:
        raise HTTPException(400, "User has no associated company")

    requested_units = data.total_units or 0

    if user.role == ROLE_PROPERTY_MANAGER:
        remaining = (user.max_units or 0) - (user.used_units or 0)

        if requested_units > remaining:
            raise HTTPException(
                400,
                    f"Unit limit exceeded. You have {remaining} unit(s) remaining out of {user.max_units or 0} allocated."
            )

    prop = Property(
        company_id=user.company_id,
        name=data.name,
        address=data.address,
        description=data.description,
        total_units=requested_units,
        status=data.status or "active",
        created_by=user.username,
    )
    db.add(prop)
    db.flush()

    for dim in data.dimensions:
        dtype_id = dim.dimension_type_id
        if not dtype_id:
            if not dim.name:
                raise HTTPException(400, "Dimension needs either dimension_type_id or name")
            existing = db.query(DimensionType).filter(
                DimensionType.company_id == user.company_id,
                DimensionType.name == dim.name,
            ).first()
            dtype_id = existing.id if existing else None
            if not dtype_id:
                new_dt = DimensionType(company_id=user.company_id, name=dim.name, unit=dim.unit)
                db.add(new_dt)
                db.flush()
                dtype_id = new_dt.id

        db.add(PropertyDimension(property_id=prop.id, dimension_type_id=dtype_id, value=dim.value))

    # Auto-assign to the creating PM
    db.add(PropertyAssignment(
        property_id=prop.id,
        pm_username=user.username,
        assigned_by=user.username,
    ))

    # Consume the PM's unit quota
    if user.role == ROLE_PROPERTY_MANAGER:
        user.used_units = (user.used_units or 0) + requested_units

    db.commit()
    db.refresh(prop)
    return serialize_property(prop)


@app.get("/properties")
def get_properties(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role in (ROLE_ADMIN, ROLE_COMPANY_ADMIN, ROLE_SUPER_ADMIN):
        props = db.query(Property).filter(Property.company_id == user.company_id).all()
    elif user.role == ROLE_PROPERTY_MANAGER:
        props = db.query(Property).filter(Property.created_by == user.username).all()
    else:
        raise HTTPException(403, "Not authorized to view properties")

    return [serialize_property(p) for p in props]


@app.put("/properties/{property_id}")
def update_property(
    property_id: str,
    data: PropertyUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role not in (ROLE_COMPANY_ADMIN, ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_PROPERTY_MANAGER):
        raise HTTPException(403, "Not authorized")

    prop = db.query(Property).filter(Property.id == property_id, Property.company_id == user.company_id).first()
    if not prop:
        raise HTTPException(404, "Property not found")

    if user.role == ROLE_PROPERTY_MANAGER and prop.created_by != user.username:
        raise HTTPException(403, "You can only edit properties you created")

    if data.total_units is not None and data.total_units != prop.total_units:
        creator = db.query(User).filter(User.username == prop.created_by).first()
        if creator and creator.role == ROLE_PROPERTY_MANAGER:
            delta = data.total_units - prop.total_units
            remaining = (creator.max_units or 0) - (creator.used_units or 0)
            if delta > remaining:
                raise HTTPException(400, f"Unit limit exceeded. Only {remaining} more unit(s) available.")
            if creator.role == ROLE_PROPERTY_MANAGER:
                creator.used_units = (creator.used_units or 0) + delta

    for field in ("name", "address", "description", "total_units", "status"):
        value = getattr(data, field)
        if value is not None:
            setattr(prop, field, value)

    db.commit()
    db.refresh(prop)
    return serialize_property(prop)


@app.delete("/properties/{property_id}")
def delete_property(
    property_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role not in (ROLE_COMPANY_ADMIN, ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_PROPERTY_MANAGER):
        raise HTTPException(403, "Not authorized")

    prop = db.query(Property).filter(Property.id == property_id, Property.company_id == user.company_id).first()
    if not prop:
        raise HTTPException(404, "Property not found")

    if user.role == ROLE_PROPERTY_MANAGER and prop.created_by != user.username:
        raise HTTPException(403, "You can only delete properties you created")

    creator = db.query(User).filter(User.username == prop.created_by).first()
    if creator:
        if creator.role == ROLE_PROPERTY_MANAGER:
            creator.used_units = max(0, (creator.used_units or 0) - (prop.total_units or 0))

    db.delete(prop)
    db.commit()
    return {"detail": "Property deleted"}
# ---------- serializer helper ----------

def serialize_property(prop: Property):
    return {
        "id": prop.id,
        "name": prop.name,
        "address": prop.address,
        "description": prop.description,
        "total_units": prop.total_units,          # capacity allocated from the PM's quota
        "actual_unit_count": len(prop.units),      # real count of Unit rows actually created
        "status": prop.status,
        "created_by": prop.created_by,
        "dimensions": [
            {
                "id": d.id,
                "dimension_type_id": d.dimension_type_id,
                "name": d.dimension_type.name,
                "unit": d.dimension_type.unit,
                "value": d.value,
            }
            for d in prop.dimensions
        ],
        "assigned_pms": [a.pm_username for a in prop.assignments],
    }

def serialize_unit(unit: Unit):
    return {
        "id": unit.id,
        "property_id": unit.property_id,
        "unit_number": unit.unit_number,
        "type": unit.type,
        "beds": unit.beds,
        "baths": unit.baths,
        "sqft": unit.sqft,
        "floor": unit.floor,
        "status": unit.status,
        "rent_amount": unit.rent_amount,
        "has_active_lease": (
            unit.lease is not None and unit.lease.status == "active"
        ),
    }

@app.post(
    "/properties/{property_id}/units",
    response_model=UnitResponse,
    status_code=201,
)
def create_unit(
    property_id: str,
    data: UnitCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role not in (
        ROLE_PROPERTY_MANAGER,
        ROLE_ADMIN,
        ROLE_COMPANY_ADMIN,
        ROLE_SUPER_ADMIN,
    ):
        raise HTTPException(403, "Not authorized")

    prop = db.query(Property).filter(
        Property.id == property_id,
        Property.company_id == user.company_id,
    ).first()

    if not prop:
        raise HTTPException(404, "Property not found")

    if user.role == ROLE_PROPERTY_MANAGER and prop.created_by != user.username:
        raise HTTPException(
            403,
            "You can only manage your own properties",
        )

    existing = db.query(Unit).filter(
        Unit.property_id == property_id,
        Unit.unit_number == data.unit_number,
    ).first()

    if existing:
        raise HTTPException(
            400,
            "Unit number already exists",
        )

    current_unit_count = db.query(Unit).filter(
        Unit.property_id == property_id
    ).count()

    if current_unit_count >= (prop.total_units or 0):
        raise HTTPException(
            400,
            f"This property's unit capacity ({prop.total_units or 0}) has been reached. "
            "Edit the property to increase its allocated units before adding more.",
        )

    unit = Unit(
        property_id=property_id,
        unit_number=data.unit_number,
        type=data.type,
        beds=data.beds,
        baths=data.baths,
        sqft=data.sqft,
        floor=data.floor,
        status=data.status or "vacant",
        rent_amount=data.rent_amount,
    )

    db.add(unit)
    db.commit()
    db.refresh(unit)

    return serialize_unit(unit)

@app.get(
    "/properties/{property_id}/units",
    response_model=list[UnitResponse],
)
def get_units(
    property_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    prop = db.query(Property).filter(
        Property.id == property_id,
        Property.company_id == user.company_id,
    ).first()

    if not prop:
        raise HTTPException(404, "Property not found")

    if (
        user.role == ROLE_PROPERTY_MANAGER
        and prop.created_by != user.username
    ):
        raise HTTPException(
            403,
            "Not authorized",
        )

    units = (
        db.query(Unit)
        .filter(Unit.property_id == property_id)
        .order_by(Unit.floor, Unit.unit_number)
        .all()
    )

    return [serialize_unit(u) for u in units]

@app.put(
    "/units/{unit_id}",
    response_model=UnitResponse,
)
def update_unit(
    unit_id: str,
    data: UnitUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    # Role check
    if user.role not in (
        ROLE_PROPERTY_MANAGER,
        ROLE_ADMIN,
        ROLE_COMPANY_ADMIN,
        ROLE_SUPER_ADMIN,
    ):
        raise HTTPException(403, "Not authorized")

    # Find unit (same company only)
    unit = (
        db.query(Unit)
        .join(Property)
        .filter(
            Unit.id == unit_id,
            Property.company_id == user.company_id,
        )
        .first()
    )

    if not unit:
        raise HTTPException(404, "Unit not found")

    # Property Manager can update only their own properties
    if (
        user.role == ROLE_PROPERTY_MANAGER
        and unit.property.created_by != user.username
    ):
        raise HTTPException(
            403,
            "You can only manage your own properties",
        )

    # Partial update
    update_data = data.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(unit, key, value)

    db.commit()
    db.refresh(unit)

    return serialize_unit(unit)

@app.delete("/units/{unit_id}")
def delete_unit(
    unit_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    # Role check
    if user.role not in (
        ROLE_PROPERTY_MANAGER,
        ROLE_ADMIN,
        ROLE_COMPANY_ADMIN,
        ROLE_SUPER_ADMIN,
    ):
        raise HTTPException(403, "Not authorized")

    # Find the unit (company isolation)
    unit = (
        db.query(Unit)
        .join(Property)
        .filter(
            Unit.id == unit_id,
            Property.company_id == user.company_id,
        )
        .first()
    )

    if not unit:
        raise HTTPException(404, "Unit not found")

    # Property Manager restriction
    if (
        user.role == ROLE_PROPERTY_MANAGER
        and unit.property.created_by != user.username
    ):
        raise HTTPException(
            403,
            "You can only manage your own properties",
        )

    # Block deletion if the unit has an active lease
    if unit.lease is not None and unit.lease.status == "active":
        raise HTTPException(400, "Unit has an active lease")

    # Delete the unit
    db.delete(unit)
    db.commit()

    return {
        "message": "Unit deleted successfully"
    }


@app.get("/units/me", response_model=UnitResponse)
def get_my_unit(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role != ROLE_TENANT:
        raise HTTPException(403, "Not authorized")

    lease = (
        db.query(Lease)
        .filter(
            Lease.tenant_username == user.username,
            Lease.status == "active",
        )
        .first()
    )

    if not lease:
        raise HTTPException(404, "No active unit assigned")

    return serialize_unit(lease.unit)


@app.get("/tenant/me")
def get_tenant_me(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Everything the Tenant dashboard needs in one call: unit, lease, and
    the PM to contact for that property — pulled from PropertyAssignment
    rather than hardcoded, so it stays correct if the PM changes."""
    if user.role != ROLE_TENANT:
        raise HTTPException(403, "Not authorized")

    lease = (
        db.query(Lease)
        .filter(
            Lease.tenant_username == user.username,
            Lease.status == "active",
        )
        .first()
    )

    if not lease:
        raise HTTPException(404, "No active unit assigned")

    unit = lease.unit
    property_ = lease.property

    days_to_expiry = None
    if lease.end_date:
        days_to_expiry = (lease.end_date - datetime.utcnow().date()).days

    assignment = (
        db.query(PropertyAssignment)
        .filter(PropertyAssignment.property_id == property_.id)
        .first()
    )
    pm_user = assignment.pm_user if assignment else None

    return {
        "user": {
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "phone": user.phone,
        },
        "unit": {
            "unit_number": unit.unit_number,
            "type": unit.type,
            "address": property_.address,
            "property_name": property_.name,
            "beds": unit.beds,
            "baths": unit.baths,
            "sqft": unit.sqft,
            "floor": unit.floor,
        },
        "lease": {
            "start_date": lease.start_date,
            "end_date": lease.end_date,
            "monthly_rent": lease.monthly_rent,
            "days_to_expiry": days_to_expiry,
            "status": lease.status,
        },
        "property_manager": {
            "pm_name": (pm_user.full_name or pm_user.username) if pm_user else None,
            "pm_email": pm_user.email if pm_user else None,
        } if pm_user else None,
    }


def serialize_lease(lease: Lease):
    tenant = lease.tenant
    return {
        "id": lease.id,
        "property_id": lease.property_id,
        "unit_id": lease.unit_id,
        "tenant_username": lease.tenant_username,
        "tenant_name": tenant.full_name if tenant else None,
        "tenant_email": tenant.email if tenant else None,
        "start_date": lease.start_date,
        "end_date": lease.end_date,
        "monthly_rent": lease.monthly_rent,
        "escalation_pct": lease.escalation_pct,
        "renewal_flag": lease.renewal_flag,
        "status": lease.status,
    }


def _unit_for_company(db, unit_id, company_id):
    return (
        db.query(Unit)
        .join(Property)
        .filter(Unit.id == unit_id, Property.company_id == company_id)
        .first()
    )


@app.post("/leases", status_code=201)
def create_lease(
    data: LeaseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role not in (
        ROLE_PROPERTY_MANAGER,
        ROLE_ADMIN,
        ROLE_COMPANY_ADMIN,
        ROLE_SUPER_ADMIN,
    ):
        raise HTTPException(403, "Not authorized")

    unit = _unit_for_company(db, data.unit_id, user.company_id)
    if not unit:
        raise HTTPException(404, "Unit not found")

    if user.role == ROLE_PROPERTY_MANAGER and unit.property.created_by != user.username:
        raise HTTPException(403, "You can only manage your own properties")

    # Check active lease existence directly, not just unit.status, per spec
    existing_active = (
        db.query(Lease)
        .filter(Lease.unit_id == data.unit_id, Lease.status == "active")
        .first()
    )
    if existing_active:
        raise HTTPException(400, "Unit already has an active lease")

    # Validate the tenant exists up front — without this, a typo'd username hits Postgres's
    # foreign key constraint and crashes with an unhandled 500 instead of a clean error.
    if data.tenant_username:
        tenant = db.query(User).filter(
            User.username == data.tenant_username,
            User.company_id == user.company_id,
        ).first()
        if not tenant:
            raise HTTPException(400, f"No tenant found with username '{data.tenant_username}'")

    lease = Lease(
        property_id=unit.property_id,
        unit_id=data.unit_id,
        tenant_username=data.tenant_username,
        start_date=data.start_date,
        end_date=data.end_date,
        monthly_rent=data.monthly_rent,
        escalation_pct=data.escalation_pct or 0,
        renewal_flag=data.renewal_flag or False,
        status="active",
    )
    db.add(lease)
    unit.status = "occupied"
    db.commit()
    db.refresh(lease)

    return serialize_lease(lease)


@app.get("/units/{unit_id}/lease")
def get_unit_lease(
    unit_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    unit = _unit_for_company(db, unit_id, user.company_id)
    if not unit:
        raise HTTPException(404, "Unit not found")

    lease = (
        db.query(Lease)
        .filter(Lease.unit_id == unit_id, Lease.status == "active")
        .first()
    )
    if not lease:
        raise HTTPException(404, "No active lease for this unit")

    return serialize_lease(lease)


@app.put("/leases/{lease_id}")
def update_lease(
    lease_id: str,
    data: LeaseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role not in (
        ROLE_PROPERTY_MANAGER,
        ROLE_ADMIN,
        ROLE_COMPANY_ADMIN,
        ROLE_SUPER_ADMIN,
    ):
        raise HTTPException(403, "Not authorized")

    lease = (
        db.query(Lease)
        .join(Property)
        .filter(Lease.id == lease_id, Property.company_id == user.company_id)
        .first()
    )
    if not lease:
        raise HTTPException(404, "Lease not found")

    if user.role == ROLE_PROPERTY_MANAGER and lease.property.created_by != user.username:
        raise HTTPException(403, "You can only manage your own properties")

    if data.tenant_username:
        tenant = db.query(User).filter(
            User.username == data.tenant_username,
            User.company_id == user.company_id,
        ).first()
        if not tenant:
            raise HTTPException(400, f"No tenant found with username '{data.tenant_username}'")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(lease, key, value)

    # If the lease is being terminated/expired, free up the unit
    if data.status in ("expired", "terminated"):
        lease.unit.status = "vacant"

    db.commit()
    db.refresh(lease)

    return serialize_lease(lease)


@app.get("/properties/{property_id}/leases")
def get_property_leases(
    property_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    prop = db.query(Property).filter(
        Property.id == property_id,
        Property.company_id == user.company_id,
    ).first()
    if not prop:
        raise HTTPException(404, "Property not found")

    if user.role == ROLE_PROPERTY_MANAGER and prop.created_by != user.username:
        raise HTTPException(403, "Not authorized")

    leases = (
        db.query(Lease)
        .filter(Lease.property_id == property_id)
        .order_by(Lease.start_date.desc())
        .all()
    )
    return [serialize_lease(l) for l in leases]


# ---- Owner portfolio (Day 10) ----

@app.get("/owner/portfolio")
def get_owner_portfolio(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role != ROLE_OWNER:
        raise HTTPException(403, "Not authorized")

    # Owner-to-property ownership isn't wired up yet — for now an Owner sees every
    # property in their company, same as Company Admin. Revisit once explicit
    # per-property ownership exists (tracked as a Phase 2 refinement).
    properties = (
        db.query(Property)
        .filter(Property.company_id == user.company_id)
        .order_by(Property.name.asc())
        .all()
    )

    result = []
    for prop in properties:
        units = prop.units
        total_units = len(units)
        occupied_count = sum(1 for u in units if u.status == "occupied")
        vacant_count = sum(1 for u in units if u.status == "vacant")
        maintenance_count = sum(1 for u in units if u.status == "maintenance")

        open_ticket_count = (
            db.query(MaintenanceTicket)
            .filter(
                MaintenanceTicket.property_id == prop.id,
                MaintenanceTicket.status != "closed",
            )
            .count()
        )

        result.append({
            "id": prop.id,
            "name": prop.name,
            "address": prop.address,
            "total_units": total_units,
            "occupied_count": occupied_count,
            "vacant_count": vacant_count,
            "maintenance_count": maintenance_count,
            "open_ticket_count": open_ticket_count,
        })

    return result


# ---- Maintenance tickets (Day 10) ----
# Backs the open_ticket_count on /owner/portfolio and property detail pages.
# Full tenant-facing submission workflow (with vendor assignment etc.) is a
# later day; this is the minimum CRUD needed for PM/Admin to log and close
# tickets so the dashboard counts are real.

def serialize_ticket(ticket: MaintenanceTicket):
    return {
        "id": ticket.id,
        "company_id": ticket.company_id,
        "property_id": ticket.property_id,
        "unit_id": ticket.unit_id,
        "title": ticket.title,
        "description": ticket.description,
        "category": ticket.category,
        "status": ticket.status,
        "priority": ticket.priority,
        "created_by": ticket.created_by,
        "raised_by": ticket.created_by,
        "assigned_pm": ticket.assigned_pm,
        "assigned_vendor_id": ticket.assigned_vendor_id,
        "rating": ticket.rating,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "closed_at": ticket.closed_at,
    }


TICKET_STATUSES = ("open", "in_progress", "closed")
TICKET_PRIORITIES = ("low", "normal", "high", "urgent")
TICKET_CATEGORIES = (
    "Plumbing", "Electrical", "HVAC", "Roof", "Drywall", "Pest", "Appliance", "Other",
)


def record_ticket_history(db: Session, ticket: MaintenanceTicket, from_status, to_status, changed_by, note=None):
    db.add(TicketHistory(
        ticket_id=ticket.id,
        from_status=from_status,
        to_status=to_status,
        changed_by=changed_by,
        note=note,
    ))


@app.post("/properties/{property_id}/maintenance-tickets", status_code=201)
def create_maintenance_ticket(
    property_id: str,
    data: MaintenanceTicketCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role not in (
        ROLE_PROPERTY_MANAGER,
        ROLE_ADMIN,
        ROLE_COMPANY_ADMIN,
        ROLE_SUPER_ADMIN,
        ROLE_TENANT,
    ):
        raise HTTPException(403, "Not authorized")

    prop = db.query(Property).filter(
        Property.id == property_id,
        Property.company_id == user.company_id,
    ).first()
    if not prop:
        raise HTTPException(404, "Property not found")

    if user.role == ROLE_TENANT and user.unit_id and (not data.unit_id):
        # Tenants raising a ticket without specifying a unit get their own.
        data.unit_id = user.unit_id

    if data.unit_id:
        unit = db.query(Unit).filter(
            Unit.id == data.unit_id, Unit.property_id == property_id
        ).first()
        if not unit:
            raise HTTPException(400, "Invalid unit for this property")

    if data.priority and data.priority not in TICKET_PRIORITIES:
        raise HTTPException(400, f"Invalid priority. Must be one of {TICKET_PRIORITIES}")

    ticket = MaintenanceTicket(
        company_id=prop.company_id,
        property_id=property_id,
        unit_id=data.unit_id,
        title=data.title,
        description=data.description,
        priority=data.priority or "normal",
        status="open",
        created_by=user.username,
    )
    db.add(ticket)
    db.flush()  # assigns ticket.id before the history row references it
    record_ticket_history(db, ticket, from_status=None, to_status="open", changed_by=user.username)
    db.commit()
    db.refresh(ticket)
    return serialize_ticket(ticket)


@app.get("/properties/{property_id}/maintenance-tickets")
def get_property_maintenance_tickets(
    property_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    prop = db.query(Property).filter(
        Property.id == property_id,
        Property.company_id == user.company_id,
    ).first()
    if not prop:
        raise HTTPException(404, "Property not found")

    tickets = (
        db.query(MaintenanceTicket)
        .filter(MaintenanceTicket.property_id == property_id)
        .order_by(MaintenanceTicket.created_at.desc())
        .all()
    )
    return [serialize_ticket(t) for t in tickets]


@app.put("/maintenance-tickets/{ticket_id}")
def update_maintenance_ticket(
    ticket_id: str,
    data: MaintenanceTicketUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role not in (
        ROLE_PROPERTY_MANAGER,
        ROLE_ADMIN,
        ROLE_COMPANY_ADMIN,
        ROLE_SUPER_ADMIN,
    ):
        raise HTTPException(403, "Not authorized")

    ticket = (
        db.query(MaintenanceTicket)
        .join(Property)
        .filter(MaintenanceTicket.id == ticket_id, Property.company_id == user.company_id)
        .first()
    )
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    if data.title is not None:
        ticket.title = data.title
    if data.description is not None:
        ticket.description = data.description
    if data.priority is not None:
        if data.priority not in TICKET_PRIORITIES:
            raise HTTPException(400, f"Invalid priority. Must be one of {TICKET_PRIORITIES}")
        ticket.priority = data.priority
    if data.category is not None:
        if data.category not in TICKET_CATEGORIES:
            raise HTTPException(400, f"Invalid category. Must be one of {TICKET_CATEGORIES}")
        ticket.category = data.category
    if data.assigned_pm is not None:
        ticket.assigned_pm = data.assigned_pm
    if data.assigned_vendor_id is not None:
        ticket.assigned_vendor_id = data.assigned_vendor_id
    if data.rating is not None:
        ticket.rating = data.rating
    if data.status is not None:
        if data.status not in TICKET_STATUSES:
            raise HTTPException(400, f"Invalid status. Must be one of {TICKET_STATUSES}")
        if data.status != ticket.status:
            record_ticket_history(db, ticket, from_status=ticket.status, to_status=data.status,
                                   changed_by=user.username, note=data.note)
        ticket.status = data.status
        ticket.closed_at = datetime.utcnow() if data.status == "closed" else None

    ticket.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(ticket)
    return serialize_ticket(ticket)


# ---- Maintenance tickets, Day 14 additions ----
# New routes on top of the Day 10 model above: richer creation, direct
# ticket lookup, and a /properties/{id}/tickets alias. Old routes and
# behaviour are untouched so PropertyManagement.js and the Day 10 tests
# keep working as-is.

@app.post("/tickets", status_code=201)
def create_ticket(
    data: TicketCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role not in (
        ROLE_PROPERTY_MANAGER,
        ROLE_ADMIN,
        ROLE_COMPANY_ADMIN,
        ROLE_SUPER_ADMIN,
        ROLE_TENANT,
    ):
        raise HTTPException(403, "Not authorized")

    prop = db.query(Property).filter(
        Property.id == data.property_id,
        Property.company_id == user.company_id,
    ).first()
    if not prop:
        raise HTTPException(404, "Property not found")

    unit_id = data.unit_id
    if user.role == ROLE_TENANT and user.unit_id and not unit_id:
        unit_id = user.unit_id

    if unit_id:
        unit = db.query(Unit).filter(Unit.id == unit_id, Unit.property_id == data.property_id).first()
        if not unit:
            raise HTTPException(400, "Invalid unit for this property")

    if data.category not in TICKET_CATEGORIES:
        raise HTTPException(400, f"Invalid category. Must be one of {TICKET_CATEGORIES}")

    if data.priority and data.priority not in TICKET_PRIORITIES:
        raise HTTPException(400, f"Invalid priority. Must be one of {TICKET_PRIORITIES}")

    ticket = MaintenanceTicket(
        company_id=prop.company_id,
        property_id=data.property_id,
        unit_id=unit_id,
        title=f"{data.category} issue",  # title stays required for Day 10 UI; category carries the real detail
        description=data.description,
        category=data.category,
        priority=data.priority or "normal",
        status="open",
        created_by=user.username,
    )
    db.add(ticket)
    db.flush()
    record_ticket_history(db, ticket, from_status=None, to_status="open", changed_by=user.username)
    db.commit()
    db.refresh(ticket)
    return serialize_ticket(ticket)


@app.get("/tickets/{ticket_id}")
def get_ticket(
    ticket_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    ticket = db.query(MaintenanceTicket).filter(MaintenanceTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.company_id != user.company_id:
        raise HTTPException(403, "Not authorized")
    return serialize_ticket(ticket)


@app.get("/properties/{property_id}/tickets")
def get_property_tickets(
    property_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    prop = db.query(Property).filter(
        Property.id == property_id,
        Property.company_id == user.company_id,
    ).first()
    if not prop:
        raise HTTPException(404, "Property not found")

    tickets = (
        db.query(MaintenanceTicket)
        .filter(MaintenanceTicket.property_id == property_id)
        .order_by(MaintenanceTicket.created_at.desc())
        .all()
    )
    return [serialize_ticket(t) for t in tickets]


# ---- Unit photos (Day 8) ----

MAX_PHOTO_SIZE = 5 * 1024 * 1024   # 5MB
MAX_PHOTOS_PER_UPLOAD = 5
ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def serialize_photo(photo: UnitPhoto):
    return {
        "id": photo.id,
        "unit_id": photo.unit_id,
        "url": photo.url,
        "filename": photo.filename,
        "uploaded_by": photo.uploaded_by,
        "uploaded_at": photo.uploaded_at,
    }


@app.post("/units/{unit_id}/photos", status_code=201)
async def upload_unit_photos(
    unit_id: str,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role not in (
        ROLE_PROPERTY_MANAGER,
        ROLE_ADMIN,
        ROLE_COMPANY_ADMIN,
        ROLE_SUPER_ADMIN,
    ):
        raise HTTPException(403, "Not authorized")

    unit = _unit_for_company(db, unit_id, user.company_id)
    if not unit:
        raise HTTPException(404, "Unit not found")

    if user.role == ROLE_PROPERTY_MANAGER and unit.property.created_by != user.username:
        raise HTTPException(403, "You can only manage your own properties")

    if len(files) > MAX_PHOTOS_PER_UPLOAD:
        raise HTTPException(400, f"Max {MAX_PHOTOS_PER_UPLOAD} files per upload")

    # Validate every file up front, before writing anything to disk
    contents_by_file = []
    for f in files:
        if f.content_type not in ALLOWED_PHOTO_TYPES:
            raise HTTPException(400, f"'{f.filename}' is not a supported image type")
        data = await f.read()
        if len(data) > MAX_PHOTO_SIZE:
            raise HTTPException(400, f"'{f.filename}' is too large (max 5MB)")
        contents_by_file.append(data)

    upload_dir = os.path.join("uploads", "units", unit_id)
    os.makedirs(upload_dir, exist_ok=True)

    saved_photos = []
    for f, data in zip(files, contents_by_file):
        ext = os.path.splitext(f.filename)[1] or ".jpg"
        stored_name = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(upload_dir, stored_name)
        with open(filepath, "wb") as out:
            out.write(data)

        photo = UnitPhoto(
            unit_id=unit_id,
            url=f"{BACKEND_URL}/uploads/units/{unit_id}/{stored_name}",
            filename=f.filename,
            uploaded_by=user.username,
        )
        db.add(photo)
        saved_photos.append(photo)

    db.commit()
    for p in saved_photos:
        db.refresh(p)

    return [serialize_photo(p) for p in saved_photos]


@app.get("/units/{unit_id}/photos")
def get_unit_photos(
    unit_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    unit = _unit_for_company(db, unit_id, user.company_id)
    if not unit:
        raise HTTPException(404, "Unit not found")

    photos = (
        db.query(UnitPhoto)
        .filter(UnitPhoto.unit_id == unit_id)
        .order_by(UnitPhoto.uploaded_at.asc())
        .all()
    )
    return [serialize_photo(p) for p in photos]


@app.delete("/units/{unit_id}/photos/{photo_id}")
def delete_unit_photo(
    unit_id: str,
    photo_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role not in (
        ROLE_PROPERTY_MANAGER,
        ROLE_ADMIN,
        ROLE_COMPANY_ADMIN,
        ROLE_SUPER_ADMIN,
    ):
        raise HTTPException(403, "Not authorized")

    unit = _unit_for_company(db, unit_id, user.company_id)
    if not unit:
        raise HTTPException(404, "Unit not found")

    if user.role == ROLE_PROPERTY_MANAGER and unit.property.created_by != user.username:
        raise HTTPException(403, "You can only manage your own properties")

    photo = db.query(UnitPhoto).filter(
        UnitPhoto.id == photo_id,
        UnitPhoto.unit_id == unit_id,
    ).first()
    if not photo:
        raise HTTPException(404, "Photo not found")

    # Best-effort disk cleanup — url is BACKEND_URL + /uploads/units/{unit_id}/{stored_name}
    stored_name = photo.url.rsplit("/", 1)[-1]
    filepath = os.path.join("uploads", "units", unit_id, stored_name)
    if os.path.exists(filepath):
        os.remove(filepath)

    db.delete(photo)
    db.commit()

    return {"message": "Photo deleted successfully"}


@app.get("/users/me", response_model=None)
def get_me(db=Depends(get_db), user=Depends(current_user)):
    return {
        "user_id":      user.id,
        "username":     user.username,
        "full_name":    user.full_name,
        "email":        user.email,
        "role":         user.role,
        "status":       user.status,
        "company_name": user.company.name if user.company else None,
        "company_code": user.company.company_code if user.company else None,
        "company_slug": user.company.slug if user.company else None,
        "company_id":   user.company_id,
        "max_units":    user.max_units,
        "used_units":   user.used_units,
    }


@app.patch("/users/me", response_model=None)
def update_me(data: dict, db=Depends(get_db), user=Depends(current_user)):
    """Lets any logged-in user (Tenant included) fix their own display name
    or phone number after registration, without going through User
    Management. Deliberately narrow — username, email, and role changes
    stay admin-only, this is just the self-service subset."""
    if "full_name" in data:
        full_name = (data.get("full_name") or "").strip()
        user.full_name = full_name or None
    if "phone" in data:
        phone = (data.get("phone") or "").strip()
        user.phone = phone or None
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return {
        "user_id":   user.id,
        "username":  user.username,
        "full_name": user.full_name,
        "phone":     user.phone,
    }