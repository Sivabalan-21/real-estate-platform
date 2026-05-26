from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    username: str
    password: str
    role: str
    slug: str | None = None  # ← add this


class CreateUserRequest(BaseModel):
    email: EmailStr
    role: str
    company_id: str | None = None
    username: str | None = None
    units: int = 0


class UpdateUserRequest(BaseModel):
    role: str | None = None
    status: str | None = None
    email: EmailStr | None = None
    company_id: str | None = None
    send_reset: bool = False
    revoke_sessions: bool = False
    clear_failed_logins: bool = False


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class TenantCreate(BaseModel):
    username: str
    email: EmailStr
    property_name: str
    unit_name: str
    owner_name: str
    base_rent: float
    lease_start: str