from datetime import datetime
import os
import uuid

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import Base, SessionLocal, engine
from models import Company, User
from rbac import ROLE_SUPER_ADMIN
from schemas import CreateUserRequest, LoginRequest, ResetPasswordRequest, UpdateUserRequest
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
from tokens import ALGORITHM, SECRET_KEY, create_access_token
import shutil

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

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


@app.get("/")
def home():
    return {"message": "Backend running"}

@app.post("/auth/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()

    if not user or not user.password:
        raise HTTPException(400, "Invalid credentials")
    
    if not verify_password(data.password, user.password):
        raise HTTPException(400, "Invalid credentials")
    
    if user.role != data.role:
        raise HTTPException(400, "Invalid role")
    
    # ✅ Company/slug check — must belong to this portal
    if data.slug:
        company = db.query(Company).filter(Company.slug == data.slug).first()
        if not company or user.company_id != company.id:
            raise HTTPException(400, "Invalid credentials")

    if user.status == "invited":
        raise HTTPException(403, "Please complete registration before logging in")

    if user.status == "suspended":
        raise HTTPException(403, "Your account has been suspended")


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
            User.role != "Company Admin"
        ).all()

    elif user.role == "Admin":
        users = db.query(User).filter(
            User.created_by == user.username
        ).all()

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
def complete_registration_route(token: str, data: dict, db: Session = Depends(get_db)):
    user = complete_registration(db, token, data)
    return {
        "message":      "Registration complete",
        "company_name": user.company.name if user.company else None,
        "company_code": user.company.company_code if user.company else None,
        "company_slug": user.company.slug if user.company else None,
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


@app.get("/users/me", response_model=None)
def get_me(db=Depends(get_db), user=Depends(current_user)):
    """Returns current user's profile including company fields.
    Frontend calls this on dashboard load to refresh company_name/code/slug
    in localStorage without requiring a re-login."""
    return {
        "user_id":      user.id,
        "username":     user.username,
        "email":        user.email,
        "role":         user.role,
        "status":       user.status,
        "company_name": user.company.name if user.company else None,
        "company_code": user.company.company_code if user.company else None,
        "company_slug": user.company.slug if user.company else None,
        "company_id":   user.company_id,

    }


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