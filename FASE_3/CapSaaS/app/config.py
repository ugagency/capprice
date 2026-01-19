# app/config.py
import os
from dataclasses import dataclass
from dotenv import load_dotenv

from psycopg2.pool import SimpleConnectionPool
from flask import current_app

load_dotenv()


@dataclass(frozen=True)
class Settings:
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "").strip()


def init_db_pool(app):
    dsn = (app.config.get("DATABASE_URL") or "").strip()
    if not dsn:
        raise RuntimeError("DATABASE_URL não configurada. Verifique o .env.")
    app.extensions["db_pool"] = SimpleConnectionPool(minconn=1, maxconn=10, dsn=dsn)


def get_conn():
    pool = current_app.extensions.get("db_pool")
    if not pool:
        raise RuntimeError("Pool não inicializado. Verifique init_db_pool(app).")
    return pool.getconn()


def put_conn(conn):
    pool = current_app.extensions.get("db_pool")
    if pool and conn:
        pool.putconn(conn)
