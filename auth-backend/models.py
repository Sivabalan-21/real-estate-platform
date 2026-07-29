from datetime import datetime
from uuid import uuid4
from xmlrpc.client import Boolean

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Float, Date, Boolean  
from sqlalchemy.orm import relationship
from database import Base


def uuid_str():
    return str(uuid4())


class Company(Base):
    __tablename__ = "companies"

    id           = Column(String, primary_key=True, default=uuid_str)
    name         = Column(String, unique=True, nullable=False, index=True)
    # Auto-generated once at creation. Format: first-4-letters + 4 digits, e.g. PROP-4821
    company_code = Column(String, unique=True, nullable=True, index=True)
    # URL-safe slug for branded portal, e.g. "proptech-solutions" -> /portal/proptech-solutions
    slug         = Column(String, unique=True, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    logo = Column(String, nullable=True)
    users           = relationship("User", back_populates="company")
    dimension_types = relationship("DimensionType", back_populates="company")
    properties      = relationship("Property", back_populates="company")


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=uuid_str)
    username = Column(String, unique=True, nullable=True, index=True)
    # add these after the email column
    full_name = Column(String, nullable=True)
    phone     = Column(String, nullable=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password = Column(String, nullable=True)
    role = Column(String, nullable=False, index=True)

    company_id = Column(String, ForeignKey("companies.id"), nullable=True, index=True)
    company = relationship("Company", back_populates="users")

    status = Column(String, default="invited", nullable=False, index=True)
    reset_token = Column(String, nullable=True, unique=True, index=True)
    token_type = Column(String, nullable=True)
    token_expiry = Column(DateTime, nullable=True)

    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    max_units = Column(Integer, default=0)
    used_units = Column(Integer, default=0)

class DimensionType(Base):
    __tablename__ = "dimension_types"

    id         = Column(String, primary_key=True, default=uuid_str)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    name       = Column(String, nullable=False)  # e.g. "Square Feet", "Floors", "Rooms"
    unit       = Column(String, nullable=True)   # e.g. "sqft", "floors", "nos"
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    company    = relationship("Company", back_populates="dimension_types")
    property_dimensions = relationship("PropertyDimension", back_populates="dimension_type")


class Property(Base):
    __tablename__ = "properties"

    id           = Column(String, primary_key=True, default=uuid_str)
    company_id   = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    name         = Column(String, nullable=False)        # e.g. "Block A", "Tower 1"
    address      = Column(String, nullable=True)
    description  = Column(String, nullable=True)
    total_units  = Column(Integer, default=0)
    status       = Column(String, default="active")      # active / inactive
    created_by   = Column(String, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    company = relationship("Company", back_populates="properties")

    dimensions = relationship(
        "PropertyDimension",
        back_populates="property",
        cascade="all, delete-orphan"
    )

    assignments = relationship(
        "PropertyAssignment",
        back_populates="property",
        cascade="all, delete-orphan"
    )

    units = relationship(
        "Unit",
        back_populates="property",
        cascade="all, delete-orphan"
    )

    leases = relationship(
        "Lease",
        back_populates="property",
        cascade="all, delete-orphan"
    )


class Unit(Base):
    __tablename__ = "units"

    id = Column(String, primary_key=True, default=uuid_str)

    property_id = Column(
        String,
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    unit_number = Column(String, nullable=False, index=True)

    type = Column(
        String,
        nullable=False
    )  # Studio, 1BR, 2BR, 3BR, Commercial

    beds = Column(Integer, nullable=True)

    baths = Column(Float, nullable=True)

    sqft = Column(Integer, nullable=True)

    floor = Column(Integer, nullable=True)

    status = Column(
        String,
        default="vacant",
        nullable=False
    )  # vacant / occupied / maintenance

    rent_amount = Column(Float, nullable=True)

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )

    property = relationship(
        "Property",
        back_populates="units"
    )

    lease = relationship(
        "Lease",
        back_populates="unit",
        uselist=False
    )

class Lease(Base):
    __tablename__ = "leases"

    id = Column(String, primary_key=True, default=uuid_str)

    property_id = Column(
        String,
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    unit_id = Column(
        String,
        ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    tenant_username = Column(
        String,
        ForeignKey("users.username"),
        nullable=True,
        index=True,
    )

    start_date = Column(Date, nullable=False)

    end_date = Column(Date, nullable=True)

    monthly_rent = Column(Float, nullable=False)

    escalation_pct = Column(Float, default=0.0)

    renewal_flag = Column(Boolean, default=False)

    status = Column(
        String,
        default="active",
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    property = relationship(
        "Property",
        back_populates="leases",
    )

    unit = relationship(
        "Unit",
        back_populates="lease",
    )

    tenant = relationship(
        "User",
        foreign_keys=[tenant_username],
    )


class PropertyDimension(Base):
    __tablename__ = "property_dimensions"

    id                = Column(String, primary_key=True, default=uuid_str)
    property_id       = Column(String, ForeignKey("properties.id"), nullable=False, index=True)
    dimension_type_id = Column(String, ForeignKey("dimension_types.id"), nullable=False)
    value             = Column(String, nullable=False)   # e.g. "2400", "5", "12"

    property          = relationship("Property", back_populates="dimensions")
    dimension_type    = relationship("DimensionType", back_populates="property_dimensions")


class PropertyAssignment(Base):
    __tablename__ = "property_assignments"

    id          = Column(String, primary_key=True, default=uuid_str)
    property_id = Column(String, ForeignKey("properties.id"), nullable=False, index=True)
    pm_username = Column(String, ForeignKey("users.username"), nullable=False, index=True)
    assigned_by = Column(String, nullable=True)
    assigned_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    property    = relationship("Property", back_populates="assignments")
    pm_user     = relationship("User", foreign_keys=[pm_username])