from datetime import datetime, timedelta
import os
import secrets

from jose import jwt


SECRET_KEY = os.getenv("SECRET_KEY", "mysecretkey123")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
INVITE_TOKEN_HOURS = int(os.getenv("INVITE_TOKEN_HOURS", "24"))
RESET_TOKEN_MINUTES = int(os.getenv("RESET_TOKEN_MINUTES", "30"))


def create_access_token(data: dict):
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_invite_token():
    return secrets.token_urlsafe(32), datetime.utcnow() + timedelta(hours=INVITE_TOKEN_HOURS)


def create_reset_token():
    return secrets.token_urlsafe(32), datetime.utcnow() + timedelta(minutes=RESET_TOKEN_MINUTES)


def is_token_expired(expiry):
    return expiry is not None and expiry < datetime.utcnow()