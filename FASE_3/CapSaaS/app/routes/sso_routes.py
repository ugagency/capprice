# app/routes/sso_routes.py
from __future__ import annotations

from flask import Blueprint, current_app, request, redirect, jsonify, session, url_for
import jwt

from app.services.sso_service import (
    create_sso_code,
    exchange_code_for_token,
    validate_client,
    get_redirect_for_client,
    _load_sso_from_db,  # interno do serviço (usaremos para validar JWT no userinfo)
)

from app.config import get_conn, put_conn

sso_bp = Blueprint("sso", __name__)


def _require_login():
    """
    CAPSSYS é o IdP: precisa ter usuário logado aqui (session["user"]).
    """
    user = session.get("user")
    if not user:
        return None
    user_id = user.get("user_id") or user.get("id")
    return user_id


def _decode_and_validate_bearer(token: str) -> dict:
    """
    Valida o JWT emitido pelo CAPSSYS usando tb_sso_config + audience do client.
    """
    config, clients = _load_sso_from_db(current_app)

    unverified = jwt.decode(token, options={"verify_signature": False})
    aud = unverified.get("aud")

    payload = jwt.decode(
        token,
        key=config["jwt_secret"],
        algorithms=[config["jwt_alg"]],
        issuer=config["issuer"],
        audience=aud,
        options={"require": ["exp", "iat", "iss", "aud", "sub"]},
    )
    return payload


def _list_user_roles(user_id: str) -> list[str]:
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.code
                FROM cs_app.tb_user_role ur
                JOIN cs_app.tb_role r ON r.role_id = ur.role_id
                WHERE ur.user_id = %s AND r.is_active = true
                """,
                (user_id,),
            )
            return [r[0] for r in cur.fetchall()]
    finally:
        if conn:
            put_conn(conn)


def _list_app_modules(client_id: str) -> list[dict]:
    """
    Novo modelo: módulos habilitados por app.
    """
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT module_key, module_label, enabled
                FROM cs_app.tb_app_module
                WHERE client_id = %s
                  AND enabled = true
                ORDER BY module_label ASC
                """,
                (client_id,),
            )
            return [{"module_key": r[0], "module_label": r[1], "enabled": bool(r[2])} for r in cur.fetchall()]
    finally:
        if conn:
            put_conn(conn)


def _get_user_module_permissions(client_id: str, user_id: str) -> dict:
    """
    Novo modelo: permissões por usuário + app + módulo.
    Retorna dict: {module_key: allowed_bool}
    """
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT module_key, COALESCE(allowed, true)
                FROM cs_app.tb_user_app_module_perm
                WHERE client_id = %s
                  AND user_id = %s::uuid
                """,
                (client_id, str(user_id)),
            )
            return {r[0]: bool(r[1]) for r in cur.fetchall()}
    finally:
        if conn:
            put_conn(conn)


# -------------------------------
# STARTS
# -------------------------------

@sso_bp.get("/sso/start/capprice")
def sso_start_capprice():
    user_id = _require_login()
    if not user_id:
        return redirect(url_for("auth.home"))

    client_id = "capprice"
    request_ip = request.headers.get("X-Forwarded-For", request.remote_addr)
    user_agent = request.headers.get("User-Agent", "")

    code, state = create_sso_code(
        current_app,
        client_id=client_id,
        user_id=user_id,
        request_ip=request_ip,
        user_agent=user_agent,
    )

    redirect_url = get_redirect_for_client(current_app, client_id)
    sep = "&" if "?" in redirect_url else "?"
    return redirect(f"{redirect_url}{sep}code={code}&state={state}")


@sso_bp.get("/sso/start/captransportation")
def sso_start_captransportation():
    user_id = _require_login()
    if not user_id:
        return redirect(url_for("auth.home"))

    client_id = "captransportation"
    request_ip = request.headers.get("X-Forwarded-For", request.remote_addr)
    user_agent = request.headers.get("User-Agent", "")

    code, state = create_sso_code(
        current_app,
        client_id=client_id,
        user_id=user_id,
        request_ip=request_ip,
        user_agent=user_agent,
    )

    redirect_url = get_redirect_for_client(current_app, client_id)
    sep = "&" if "?" in redirect_url else "?"
    return redirect(f"{redirect_url}{sep}code={code}&state={state}")


# -------------------------------
# EXCHANGE
# -------------------------------

@sso_bp.post("/api/sso/exchange")
def sso_exchange():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    client_id = (data.get("client_id") or "").strip()
    client_secret = data.get("client_secret") or ""

    if not code or not client_id or not client_secret:
        return jsonify({"ok": False, "message": "Parâmetros obrigatórios: code, client_id, client_secret"}), 400

    ok, client_or_msg = validate_client(current_app, client_id, client_secret)
    if not ok:
        return jsonify({"ok": False, "message": client_or_msg}), 401

    try:
        token, ttl = exchange_code_for_token(current_app, code=code, client_id=client_id)
        return jsonify({
            "ok": True,
            "token_type": "Bearer",
            "access_token": token,
            "expires_in": ttl
        }), 200
    except ValueError as e:
        return jsonify({"ok": False, "message": str(e)}), 400
    except Exception:
        current_app.logger.exception("Erro inesperado em /api/sso/exchange")
        return jsonify({"ok": False, "message": "Erro interno"}), 500


# -------------------------------
# USERINFO (CENTRALIZADO NO NOVO MODELO)
# -------------------------------

@sso_bp.get("/api/sso/userinfo")
def sso_userinfo():
    """
    Retorna identidade + autorização (módulos/permissões) no novo modelo:
      - cs_app.tb_app_module
      - cs_app.tb_user_app_module_perm

    Authorization: Bearer <token>
    """
    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        return jsonify({"ok": False, "message": "Missing bearer token"}), 401

    token = auth.split(" ", 1)[1].strip()
    try:
        payload = _decode_and_validate_bearer(token)
    except Exception as e:
        return jsonify({"ok": False, "message": f"Invalid token: {e}"}), 401

    user_id = str(payload.get("sub") or "").strip()
    client_id = str(payload.get("aud") or "").strip()

    if not user_id:
        return jsonify({"ok": False, "message": "Token sem sub"}), 401
    if not client_id:
        return jsonify({"ok": False, "message": "Token sem aud (client_id)"}), 401

    # Dados base do usuário
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.user_id, u.email, u.nome
                FROM cs_app.tb_user u
                WHERE u.user_id = %s
                  AND u.is_active = true
                """,
                (user_id,),
            )
            row = cur.fetchone()
            if not row:
                return jsonify({"ok": False, "message": "Usuário inválido/inativo"}), 401

        roles = _list_user_roles(user_id)

        # Novo modelo
        modules = _list_app_modules(client_id)                  # módulos habilitados no app
        permissions = _get_user_module_permissions(client_id, user_id)  # dict module_key -> bool

        return jsonify({
            "ok": True,
            "client_id": client_id,
            "user": {
                "user_id": str(row[0]),
                "email": row[1],
                "nome": row[2],
                "roles": roles,              # mantém (ADMIN etc.)
                "modules": modules,          # [{module_key,module_label,enabled}]
                "permissions": permissions,  # {module_key: bool}
            }
        }), 200
    finally:
        if conn:
            put_conn(conn)
