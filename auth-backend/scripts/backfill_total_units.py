"""
One-time backfill: fix total_units on existing properties.

Why this is needed:
Before this fix, create_unit never checked total_units, so many properties
have total_units=0 (or too low) while real Unit rows already exist. Once
the new capacity check ships, those properties would immediately be
blocked from adding any more units.

This script sets total_units to the greater of:
  - its current value, or
  - the number of Unit rows the property actually has

It does NOT touch a PM's used_units quota ledger — it only repairs the
per-property capacity number so existing data doesn't get wrongly blocked.
If you also want existing usage to count against each PM's overall quota
going forward, that's a separate, deliberate decision — do not fold it
into this script silently.

Run from auth-backend/:
    python3 scripts/backfill_total_units.py            # dry run (default)
    python3 scripts/backfill_total_units.py --apply     # actually commit changes
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import SessionLocal
from models import Property, Unit


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
        properties = db.query(Property).all()
        changed = 0

        for prop in properties:
            actual_count = db.query(Unit).filter(Unit.property_id == prop.id).count()
            current = prop.total_units or 0

            if actual_count > current:
                print(
                    f"[{'APPLY' if args.apply else 'DRY RUN'}] "
                    f"Property '{prop.name}' ({prop.id}): "
                    f"total_units {current} -> {actual_count} "
                    f"(created_by={prop.created_by})"
                )
                if args.apply:
                    prop.total_units = actual_count
                changed += 1

        if args.apply:
            db.commit()
            print(f"\nDone. Updated {changed} propert{'y' if changed == 1 else 'ies'}.")
        else:
            print(f"\nDry run complete. {changed} propert{'y' if changed == 1 else 'ies'} would be updated.")
            print("Re-run with --apply to actually commit these changes.")
    finally:
        db.close()


if __name__ == "__main__":
    main()