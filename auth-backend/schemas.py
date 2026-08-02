from datetime import date
from typing import Optional
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


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    role: str
    company_id: int | None = None
    is_active: bool

    class Config:
        from_attributes = True  # was orm_mode=True in Pydantic v1

class DimensionTypeCreate(BaseModel):
    name: str
    unit: str | None = None


class DimensionValueIn(BaseModel):
    dimension_type_id: str | None = None   # existing dimension type
    name: str | None = None                # OR create new on the fly
    unit: str | None = None
    value: str


class PropertyCreate(BaseModel):
    name: str
    address: str | None = None
    description: str | None = None
    total_units: int | None = 0
    status: str | None = "active"
    dimensions: list[DimensionValueIn] = []


class PropertyUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    description: str | None = None
    total_units: int | None = None
    status: str | None = None

class UnitCreate(BaseModel):
    unit_number: str
    type: str
    beds: Optional[int] = None
    baths: Optional[float] = None
    sqft: Optional[int] = None
    floor: Optional[int] = None
    status: Optional[str] = "vacant"
    rent_amount: Optional[float] = None


class UnitUpdate(BaseModel):
    unit_number: Optional[str] = None
    type: Optional[str] = None
    beds: Optional[int] = None
    baths: Optional[float] = None
    sqft: Optional[int] = None
    floor: Optional[int] = None
    status: Optional[str] = None
    rent_amount: Optional[float] = None


class UnitResponse(BaseModel):
    id: str
    property_id: str
    unit_number: str
    type: str
    beds: Optional[int] = None
    baths: Optional[float] = None
    sqft: Optional[int] = None
    floor: Optional[int] = None
    status: str
    rent_amount: Optional[float] = None
    has_active_lease: bool

    class Config:
        from_attributes = True


class AssignRequest(BaseModel):
    pm_username: str


class LeaseCreate(BaseModel):
    unit_id: str
    tenant_username: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    monthly_rent: float
    escalation_pct: Optional[float] = 0
    renewal_flag: Optional[bool] = False


class LeaseUpdate(BaseModel):
    tenant_username: Optional[str] = None
    end_date: Optional[date] = None
    monthly_rent: Optional[float] = None
    escalation_pct: Optional[float] = None
    renewal_flag: Optional[bool] = None
    status: Optional[str] = None