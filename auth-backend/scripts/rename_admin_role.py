"""
One-time migration: rename the 'Admin' role to 'Regional Manager'.

Why this is needed:
The role constant ROLE_ADMIN was renamed from "Admin" to "Regional Manager"
to match the role hierarchy defined in the Tenant Service LLD. The code
change alone does not touch existing rows — any user already stored with
role="Admin" (e.g. admin1) must be migrated, or they will stop matching
any role check in the app (login role validation, permission checks,
dashboards) the moment the new code goes live.

IMPORTANT — deployment order:
Run this AFTER pulling the new code but BEFORE restarting the backend.
If you restart first, logins for any "Admin"-role user will fail with
"Invalid role" until this script runs, because the login endpoint checks
user.role != data.role and the frontend will now only ever send
"Regional Manager".

Run from auth-backend/:
    python3 scripts/rename_admin_role.py            # dry run (default)
    python3 scripts/rename_admin_role.py --apply     # actually commit changes
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import SessionLocal
from models import User

OLD_ROLE = "Admin"
NEW_ROLE = "Regional Manager"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually commit changes. Without this flag, only prints what would change.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        users = db.query(User).filter(User.role == OLD_ROLE).all()

        if not users:
            print("No users found with role 'Admin'. Nothing to migrate.")
            return

        for u in users:
            print(
                f"[{'APPLY' if args.apply else 'DRY RUN'}] "
                f"User '{u.username}' ({u.email}): role '{OLD_ROLE}' -> '{NEW_ROLE}'"
            )
            if args.apply:
                u.role = NEW_ROLE

        if args.apply:
            db.commit()
            print(f"\nDone. Migrated {len(users)} user(s).")
        else:
            print(f"\nDry run complete. {len(users)} user(s) would be migrated.")
            print("Re-run with --apply to actually commit these changes.")
    finally:
        db.close()


if __name__ == "__main__":
    main()