# app/security/sso.py
from __future__ import annotations

from flask import current_app, g, request, session


def _get_header(name: str) -> str | None:
    v = request.headers.get(name)
    return v.strip() if v else None


def load_current_user():
    """
    Cap Transportation NÃO grava em cs_app.tb_user.
    Apenas lê identidade/permissões do que foi salvo no /sso/callback (session["user"]).

    Ordem:
    1) MOCK_MODE=1 => usuário mock com tudo liberado (para testes)
    2) session["user"] => fonte padrão do SSO
    3) fallback headers (legado/gateway) => somente leitura
    """
    g.user = None

    if current_app.config.get("MOCK_MODE", False):
        g.user = {
            "user_id": "mock",
            "email": current_app.config.get("BOOTSTRAP_ADMIN_EMAIL", "admin@local"),
            "name": "Admin (Mock)",
            "roles": ["ADMIN"],
            "permissions": {
                "master": True,
                "mestre": True,
                "comercial": True,
                "programacao": True,
                "industrial": True,
                "laboratorio": True,
                "faturamento": True,
                "permissions": True,
            },
        }
        return

    su = session.get("user")
    if isinstance(su, dict) and (su.get("user_id") or su.get("id")):
        g.user = {
            "user_id": (su.get("user_id") or su.get("id") or "").strip(),
            "email": (su.get("email") or "").strip(),
            "name": (su.get("name") or su.get("nome") or "").strip(),
            "roles": su.get("roles") or [],
            "permissions": su.get("permissions") or {},
            "modules": su.get("modules") or [],
        }
        return

    # fallback por header (somente leitura)
    email = _get_header(current_app.config.get("SSO_EMAIL_HEADER", "X-User-Email")) or ""
    name = _get_header(current_app.config.get("SSO_NAME_HEADER", "X-User-Name")) or ""
    user_id = _get_header(current_app.config.get("SSO_ID_HEADER", "X-User-Id")) or ""

    if not user_id:
        g.user = None
        return

    g.user = {
        "user_id": user_id,
        "email": email,
        "name": name,
        "roles": [],
        "permissions": {},
        "modules": [],
    }
