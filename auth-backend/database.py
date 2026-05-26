from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# 👉 CHANGE PASSWORD if needed
DATABASE_URL = "postgresql://postgres:siva21@127.0.0.1:5432/auth_db"
engine = create_engine(DATABASE_URL)
print("USING DB:", DATABASE_URL)

SessionLocal = sessionmaker(bind=engine)

Base = declarative_base()