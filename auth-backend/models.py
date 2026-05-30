from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
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
    users = relationship("User", back_populates="company")


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