"""Dry run of recompute_vendor_stats. Changes are rolled back, nothing is saved."""
from database import SessionLocal
from models import MaintenanceTicket, Vendor
from main import recompute_vendor_stats

db = SessionLocal()
try:
    v = db.query(Vendor).filter(Vendor.name == "Raj Electricals").first()
    t = db.query(MaintenanceTicket).filter(MaintenanceTicket.assigned_vendor_id == v.id).first()
    print("before:", v.avg_rating, v.total_jobs)
    t.status, t.rating = "closed", 5
    recompute_vendor_stats(db, v.id)
    print("after :", v.avg_rating, v.total_jobs)
finally:
    db.rollback()
    db.close()