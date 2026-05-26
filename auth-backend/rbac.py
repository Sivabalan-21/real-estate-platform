ROLE_SUPER_ADMIN = "Super Admin"
ROLE_COMPANY_ADMIN = "Company Admin"
ROLE_ADMIN = "Admin"
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

ROLE_HIERARCHY = {
    ROLE_SUPER_ADMIN: [
        ROLE_COMPANY_ADMIN,
        ROLE_ADMIN,
        ROLE_PROPERTY_MANAGER,
        ROLE_TENANT,
        ROLE_OWNER,
        ROLE_VENDOR,
    ],
    ROLE_COMPANY_ADMIN: [ROLE_ADMIN],
    ROLE_ADMIN: [ROLE_PROPERTY_MANAGER, ROLE_TENANT, ROLE_OWNER, ROLE_VENDOR],
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