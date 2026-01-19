# app/config.py
import os


class Settings:
    # Flask
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me")
    APP_NAME = os.getenv("APP_NAME", "captransportation")

    MOCK_MODE = os.getenv("MOCK_MODE", "0").strip() == "1"

    # Headers (fallback legado)
    SSO_EMAIL_HEADER = os.getenv("SSO_EMAIL_HEADER", "X-User-Email")
    SSO_NAME_HEADER = os.getenv("SSO_NAME_HEADER", "X-User-Name")
    SSO_ID_HEADER = os.getenv("SSO_ID_HEADER", "X-User-Id")
    BOOTSTRAP_ADMIN_EMAIL = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "admin@local")

    # CAPSSYS URLs
    CAPSSYS_INTERNAL_BASE_URL = os.getenv("CAPSSYS_INTERNAL_BASE_URL", "").strip()
    CAPSSYS_PUBLIC_URL = os.getenv("CAPSSYS_PUBLIC_URL", "").strip()

    # Backward compatibility
    CAPSSYS_BASE_URL = os.getenv("CAPSSYS_BASE_URL", "").strip()

    # SSO client
    SSO_CLIENT_ID = os.getenv("SSO_CLIENT_ID", "captransportation").strip()
    SSO_CLIENT_SECRET = os.getenv("SSO_CLIENT_SECRET", "").strip()

    # DB
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "").strip()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
