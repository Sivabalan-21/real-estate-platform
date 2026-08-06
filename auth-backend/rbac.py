ROLE_SUPER_ADMIN = "Super Admin"
ROLE_COMPANY_ADMIN = "Company Admin"
ROLE_ADMIN = "Regional Manager"
ROLE_PROPERTY_MANAGER = "Property Manager"
ROLE_TENANT = "Tenant"
ROLE_OWNER = "Owner"
ROLE_VENDOR = "Vendor"

ALL_ROLES = [
    ROLE_SUPER_ADMIN,
    ROLE_COMPANY_ADMIN,
    ROLE_ADMIN,
    ROLE_PROPERTY_MANAGER,
    ROLE_TENANT,
    ROLE_OWNER,
    ROLE_VENDOR,
]

USER_STATUSES = ["invited", "active", "suspended"]

# --- Tenant Service LLD (person-tenant profile) -----------------------------
# These are separate from USER_STATUSES: `User.status` gates login/auth for
# every role. `User.tenant_status` (Tenant role only) tracks the LLD's
# onboarding/document-verification lifecycle and is independent of whether
# the tenant can currently log in.
ID_TYPES = ["AADHAR", "PASSPORT", "DRIVING_LICENSE"]
TENANT_STATUSES = ["ONBOARDING", "ACTIVE", "MOVED_OUT"]

# Which tenant_status values a given tenant_status may move to. ONBOARDING
# can be cancelled straight to MOVED_OUT (invited then never moved in);
# MOVED_OUT is terminal.
TENANT_STATUS_TRANSITIONS = {
    "ONBOARDING": {"ACTIVE", "MOVED_OUT"},
    "ACTIVE": {"MOVED_OUT"},
    "MOVED_OUT": set(),
}

ROLE_HIERARCHY = {
    ROLE_SUPER_ADMIN: [
        ROLE_COMPANY_ADMIN,
        ROLE_ADMIN,
        ROLE_PROPERTY_MANAGER,
        ROLE_TENANT,
        ROLE_OWNER,
        ROLE_VENDOR,
    ],
    ROLE_COMPANY_ADMIN: [ROLE_ADMIN, ROLE_OWNER, ROLE_TENANT],
    ROLE_ADMIN: [ROLE_PROPERTY_MANAGER],
    ROLE_PROPERTY_MANAGER: [ROLE_TENANT, ROLE_VENDOR, ROLE_OWNER],
}


def can_create(current_role: str, target_role: str) -> bool:
    return target_role in ROLE_HIERARCHY.get(current_role, [])


def can_assign_role(current_role: str, target_role: str) -> bool:
    return can_create(current_role, target_role)


def is_super_admin(role: str) -> bool:
    return role == ROLE_SUPER_ADMIN


def is_valid_role(role: str) -> bool:
    return role in ALL_ROLES