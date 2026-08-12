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

    # Tenant-only: the unit this user is linked to at invite time. Kept as a
    # direct pointer so the Tenant dashboard doesn't have to wait on a Lease
    # row existing. The Lease (via tenant_username) remains the source of
    # truth for active occupancy/rent once the PM creates it.
    unit_id = Column(String, ForeignKey("units.id"), nullable=True, index=True)
    unit = relationship("Unit", foreign_keys=[unit_id])

    # Tenant Service LLD — person-tenant profile fields. Nullable/unused for
    # every other role.
    id_type = Column(String, nullable=True)        # AADHAR / PASSPORT / DRIVING_LICENSE
    id_number = Column(String, nullable=True)
    move_in_date = Column(Date, nullable=True)
    # ONBOARDING -> ACTIVE -> MOVED_OUT. Independent of `status` above, which
    # controls login access. A tenant can be `status="active"` (can log in)
    # while still `tenant_status="ONBOARDING"` (documents not yet verified).
    tenant_status = Column(String, nullable=True, index=True)

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

    photos = relationship(
        "UnitPhoto",
        back_populates="unit",
        cascade="all, delete-orphan"
    )

class MaintenanceTicket(Base):
    """Day 10 model, extended Day 14 with company isolation, assignment,
    and categorisation fields per the Tenant Service / RBAC LLD.

    `created_by` doubles as the Day 14 spec's `raised_by` — it's already the
    username of whoever opened the ticket (PM logging on a tenant's behalf,
    or the tenant themselves), so a second column would just duplicate it.
    New code should read/write it via the `raised_by` property below.

    `status` stays lowercase (open/in_progress/closed) to match the Day 10
    rows, the /owner/portfolio badge-count query, and the existing tests —
    the Day 14 spec's 'Open' capitalisation is a display concern, not a
    stored-value one.
    """
    __tablename__ = "maintenance_tickets"

    id = Column(String, primary_key=True, default=uuid_str)

    # Denormalised alongside property_id so company-wide ticket queries
    # (Day 14) don't need a join through properties. Backfilled from
    # property.company_id for pre-Day-14 rows.
    company_id = Column(
        String,
        ForeignKey("companies.id"),
        nullable=False,
        index=True,
    )

    property_id = Column(
        String,
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    unit_id = Column(
        String,
        ForeignKey("units.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    title = Column(String, nullable=False)
    description = Column(String, nullable=True)

    # Plumbing / Electrical / HVAC / Roof / Drywall / Pest / Appliance / Other
    category = Column(String, nullable=True, index=True)

    # open -> in_progress -> closed. "Open tickets" for dashboard purposes
    # means anything not yet closed (open or in_progress).
    status = Column(String, default="open", nullable=False, index=True)

    priority = Column(String, default="normal", nullable=False)  # low / normal / high / urgent

    created_by = Column(String, nullable=True)

    # PM currently responsible for this ticket. Nullable until triaged.
    assigned_pm = Column(String, ForeignKey("users.username"), nullable=True, index=True)

    # vendors table doesn't exist until Month 2 — plain nullable column with
    # no FK constraint for now, per the Day 14 spec. Will get a real FK once
    # the Vendor model lands.
    assigned_vendor_id = Column(String, nullable=True, index=True)

    rating = Column(Integer, nullable=True)  # tenant's 1-5 rating after closure

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    closed_at = Column(DateTime, nullable=True)

    company = relationship("Company")
    property = relationship("Property")
    unit = relationship("Unit")
    assigned_pm_user = relationship("User", foreign_keys=[assigned_pm])

    attachments = relationship(
        "TicketAttachment",
        back_populates="ticket",
        cascade="all, delete-orphan",
    )
    history = relationship(
        "TicketHistory",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="TicketHistory.created_at",
    )

    # Day 14 spec calls this field `raised_by` — it's the same value as
    # `created_by` (whoever opened the ticket). No separate property here:
    # this class already has a `property` relationship attribute (to the
    # Property model), which shadows the `@property` decorator inside the
    # class body. serialize_ticket() just reads `created_by` directly for
    # both fields instead.


class TicketAttachment(Base):
    __tablename__ = "ticket_attachments"

    id = Column(String, primary_key=True, default=uuid_str)

    ticket_id = Column(
        String,
        ForeignKey("maintenance_tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    url = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    type = Column(String, nullable=False)  # photo / quote / invoice
    uploaded_by = Column(String, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    ticket = relationship("MaintenanceTicket", back_populates="attachments")


class TicketHistory(Base):
    __tablename__ = "ticket_history"

    id = Column(String, primary_key=True, default=uuid_str)

    ticket_id = Column(
        String,
        ForeignKey("maintenance_tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    from_status = Column(String, nullable=True)   # null on the creation row
    to_status = Column(String, nullable=False)
    changed_by = Column(String, nullable=True)
    note = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    ticket = relationship("MaintenanceTicket", back_populates="history")


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


class UnitPhoto(Base):
    __tablename__ = "unit_photos"

    id = Column(String, primary_key=True, default=uuid_str)

    unit_id = Column(
        String,
        ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    url = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    uploaded_by = Column(String, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    unit = relationship("Unit", back_populates="photos")


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