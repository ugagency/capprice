# app/services/sso_service.py

import time
import secrets
import jwt
from datetime import datetime, timedelta, timezone
from werkzeug.security import check_password_hash

# Cache simples em memória (por processo)
_SSO_CACHE = {"loaded_at": 0, "ttl": 30, "config": None, "clients": None}


def _utcnow():
    return datetime.now(timezone.utc)


def _get_pool(app):
    pool = app.extensions.get("db_pool")
    if not pool:
        raise RuntimeError("Pool não inicializado. Verifique init_db_pool(app).")
    return pool


def _load_sso_from_db(app):
    """Carrega config e clients do DB e mantém cache curto."""
    now = time.time()
    if _SSO_CACHE["config"] and (now - _SSO_CACHE["loaded_at"]) < _SSO_CACHE["ttl"]:
        return _SSO_CACHE["config"], _SSO_CACHE["clients"]

    pool = _get_pool(app)
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            # config ativa
            cur.execute("""
                SELECT issuer, jwt_alg, jwt_secret, jwt_ttl_seconds, code_ttl_seconds, state_ttl_seconds
                FROM cs_app.tb_sso_config
                WHERE enabled = true
                ORDER BY updated_at DESC
                LIMIT 1
            """)
            row = cur.fetchone()
            if not row:
                raise RuntimeError(
                    "SSO config ativa não encontrada em cs_app.tb_sso_config (enabled=true)."
                )

            config = {
                "issuer": row[0],
                "jwt_alg": row[1],
                "jwt_secret": row[2],
                "jwt_ttl": int(row[3]),
                "code_ttl": int(row[4]),
                "state_ttl": int(row[5]),
            }

            # clients
            cur.execute("""
                SELECT client_id, client_secret_hash, audience, enabled
                FROM cs_app.tb_sso_client
            """)
            clients = {}
            for client_id, secret_hash, audience, enabled in cur.fetchall():
                clients[client_id] = {
                    "secret_hash": secret_hash,
                    "audience": audience,
                    "enabled": bool(enabled),
                    "redirects": []
                }

            # redirects
            cur.execute("""
                SELECT client_id, redirect_url
                FROM cs_app.tb_sso_client_redirect
                WHERE enabled = true
            """)
            for client_id, redirect_url in cur.fetchall():
                if client_id in clients:
                    clients[client_id]["redirects"].append(redirect_url)

        _SSO_CACHE["loaded_at"] = now
        _SSO_CACHE["config"] = config
        _SSO_CACHE["clients"] = clients
        return config, clients
    finally:
        pool.putconn(conn)


def validate_client(app, client_id: str, client_secret: str):
    _, clients = _load_sso_from_db(app)
    client = clients.get(client_id)
    if not client or not client["enabled"]:
        print(f"[DEBUG SSO] Client {client_id} not found or disabled.")
        return False, "client inválido ou desabilitado"

    print(f"[DEBUG SSO] Validating client: {client_id}")
    print(f"[DEBUG SSO] Received secret: {client_secret}")
    print(f"[DEBUG SSO] Hash in cache: {client['secret_hash']}")
    
    matches = check_password_hash(client["secret_hash"], client_secret or "")
    print(f"[DEBUG SSO] Matches: {matches}")

    if not matches:
        return False, "client_secret inválido"

    return True, client


def get_redirect_for_client(app, client_id: str, preferred_redirect: str | None = None) -> str:
    _, clients = _load_sso_from_db(app)
    client = clients.get(client_id)
    if not client or not client["enabled"]:
        raise ValueError("client inválido ou desabilitado")

    redirects = client.get("redirects") or []
    if not redirects:
        raise ValueError("client sem redirect_url habilitada")

    if preferred_redirect:
        if preferred_redirect in redirects:
            return preferred_redirect
        raise ValueError("redirect_url não permitida para este client")

    return redirects[0]


def create_sso_code(app, client_id: str, user_id: str, request_ip: str | None, user_agent: str | None):
    config, clients = _load_sso_from_db(app)
    client = clients.get(client_id)
    if not client or not client["enabled"]:
        raise ValueError("client inválido ou desabilitado")

    code = secrets.token_urlsafe(32)
    state = secrets.token_urlsafe(24)
    expires_at = _utcnow() + timedelta(seconds=config["code_ttl"])

    pool = _get_pool(app)
    conn = pool.getconn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO cs_app.tb_sso_code
                      (code, state, client_id, user_id, expires_at, request_ip, user_agent)
                    VALUES
                      (%s, %s, %s, %s, %s, %s, %s)
                """, (code, state, client_id, user_id, expires_at, request_ip, user_agent))
        return code, state
    finally:
        pool.putconn(conn)


def exchange_code_for_token(app, code: str, client_id: str):
    config, clients = _load_sso_from_db(app)
    client = clients.get(client_id)
    if not client or not client["enabled"]:
        raise ValueError("client inválido ou desabilitado")

    pool = _get_pool(app)
    conn = pool.getconn()
    try:
        with conn:
            with conn.cursor() as cur:
                # trava linha para evitar dupla troca
                cur.execute("""
                    SELECT user_id, expires_at, used_at
                    FROM cs_app.tb_sso_code
                    WHERE code = %s AND client_id = %s
                    FOR UPDATE
                """, (code, client_id))
                row = cur.fetchone()
                if not row:
                    raise ValueError("code inválido")

                user_id, expires_at, used_at = row
                now = _utcnow()

                if used_at is not None:
                    raise ValueError("code já utilizado")
                if expires_at < now:
                    raise ValueError("code expirado")

                cur.execute("""
                    UPDATE cs_app.tb_sso_code
                    SET used_at = now()
                    WHERE code = %s
                """, (code,))

        aud = client["audience"]
        iat = int(_utcnow().timestamp())
        exp = int((_utcnow() + timedelta(seconds=config["jwt_ttl"])).timestamp())

        payload = {
            "sub": str(user_id),
            "iss": config["issuer"],
            "aud": aud,
            "iat": iat,
            "exp": exp,
        }

        if config["jwt_alg"] == "HS256":
            if not config["jwt_secret"]:
                raise RuntimeError("jwt_secret não configurado em tb_sso_config para HS256.")
            token = jwt.encode(payload, config["jwt_secret"], algorithm="HS256")
        else:
            raise RuntimeError(f"Algoritmo JWT não suportado no MVP: {config['jwt_alg']}")

        return token, config["jwt_ttl"]
    finally:
        pool.putconn(conn)
