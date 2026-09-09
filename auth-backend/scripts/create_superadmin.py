import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bcrypt
from database import SessionLocal
from models import User, uuid_str

USERNAME = "superadmin"
EMAIL = "superadmin@local.dev"
PASSWORD = "ChangeMe123!"

db = SessionLocal()

existing = db.query(User).filter(User.username == USERNAME).first()
if existing:
    print(f"User '{USERNAME}' already exists (status={existing.status}). Nothing to do.")
else:
    hashed = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt()).decode()
    user = User(
        id=uuid_str(),
        username=USERNAME,
        email=EMAIL,
        password=hashed,
        role="Super Admin",
        status="active",
    )
    db.add(user)
    db.commit()
    print(f"Created user '{USERNAME}' with password '{PASSWORD}'")

db.close()