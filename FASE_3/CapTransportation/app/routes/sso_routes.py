# app/routes/sso_routes.py
from __future__ import annotations

import requests
import jwt
from flask import Blueprint, current_app, request, session, redirect

sso_cb = Blueprint("sso_cb", __name__)


def _capssys_internal() -> str:
    base = (current_app.config.get("CAPSSYS_INTERNAL_BASE_URL") or "").rstrip("/")
    if not base:
        base = (current_app.config.get("CAPSSYS_BASE_URL") or "").rstrip("/")
    return base


def _extract_user_from_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
    except Exception:
        payload = {}
    return {
        "user_id": str(payload.get("user_id") or payload.get("sub") or "").strip(),
        "email": str(payload.get("email") or "").strip(),
        "name": str(payload.get("name") or payload.get("nome") or "").strip(),
    }


def _userinfo(token: str) -> dict:
    base = _capssys_internal()
    if not base:
        return {}

    try:
        r = requests.get(
            f"{base}/api/sso/userinfo",
            headers={"Authorization": f"Bearer {token}"},
            timeout=12,
        )
    except requests.RequestException:
        return {}

    if r.status_code != 200:
        return {}

    try:
        data = r.json()
    except Exception:
        return {}

    if not isinstance(data, dict) or not data.get("ok"):
        return {}

    u = data.get("user") or {}
    if not isinstance(u, dict):
        return {}

    return {
        "user_id": str(u.get("user_id") or "").strip(),
        "email": str(u.get("email") or "").strip(),
        "name": str(u.get("nome") or u.get("name") or "").strip(),
        "roles": u.get("roles") or [],
        "modules": u.get("modules") or [],
        "permissions": u.get("permissions") or {},
    }


@sso_cb.get("/sso/callback")
def sso_callback():
    code = (request.args.get("code") or "").strip()
    if not code:
        return "Missing code", 400

    capssys = _capssys_internal()
    client_id = (current_app.config.get("SSO_CLIENT_ID") or "").strip()
    client_secret = (current_app.config.get("SSO_CLIENT_SECRET") or "").strip()

    if not capssys or not client_id or not client_secret:
        return "SSO not configured (CAPSSYS_INTERNAL_BASE_URL/SSO_CLIENT_ID/SSO_CLIENT_SECRET)", 500

    # Exchange
    r = requests.post(
        f"{capssys}/api/sso/exchange",
        json={"code": code, "client_id": client_id, "client_secret": client_secret},
        timeout=12,
    )
    if r.status_code != 200:
        return f"SSO exchange failed: {r.status_code} - {r.text}", 401

    data = r.json()
    token = data.get("access_token")
    if not token:
        return "SSO exchange failed: missing access_token", 401

    # Userinfo (novo processo)
    u = _userinfo(token)

    # Fallback mínimo se userinfo falhar
    if not u:
        u = _extract_user_from_token(token)
        u["roles"] = []
        u["modules"] = []
        u["permissions"] = {}

    if not u.get("user_id"):
        return "SSO inválido: sem user_id", 401

    session["user"] = u
    session["sso_access_token"] = token
    session["sso_external_id"] = u["user_id"]
    session["sso_authenticated"] = True
    session.modified = True

    return redirect("/")
