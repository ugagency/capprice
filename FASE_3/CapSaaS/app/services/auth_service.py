# app/services/auth_service.py
from dataclasses import dataclass
from typing import Optional, Dict, Any, List

from app.config import get_conn, put_conn


@dataclass
class AuthResult:
    ok: bool
    message: str = ""
    user: Optional[Dict[str, Any]] = None


def authenticate_user(email: str, password: str, ip: str = None, user_agent: str = None) -> AuthResult:
    email = (email or "").strip()
    password = (password or "").strip()

    if not email or not password:
        return AuthResult(ok=False, message="Informe e-mail e senha.")

    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    u.user_id,
                    u.email,
                    u.nome,
                    u.must_change_pass
                FROM cs_app.tb_user u
                WHERE lower(u.email) = lower(%s)
                  AND u.is_active = true
                  AND u.password_hash = public.crypt(%s, u.password_hash)
                """,
                (email, password),
            )
            row = cur.fetchone()

            if not row:
                cur.execute(
                    """
                    INSERT INTO cs_app.tb_login_audit (user_id, email, success, ip, user_agent, fail_reason)
                    VALUES (NULL, %s, false, %s::inet, %s, %s)
                    """,
                    (email, ip, user_agent, "INVALID_CREDENTIALS"),
                )
                conn.commit()
                return AuthResult(ok=False, message="Acesso negado. Verifique os dados.")

            user_id, db_email, nome, must_change_pass = row

            # roles do usuário (níveis)
            cur.execute(
                """
                SELECT r.code
                FROM cs_app.tb_user_role ur
                JOIN cs_app.tb_role r ON r.role_id = ur.role_id
                WHERE ur.user_id = %s AND r.is_active = true
                """,
                (user_id,),
            )
            roles: List[str] = [r[0] for r in cur.fetchall()]

            cur.execute(
                "UPDATE cs_app.tb_user SET last_login_at = now() WHERE user_id = %s",
                (user_id,),
            )

            cur.execute(
                """
                INSERT INTO cs_app.tb_login_audit (user_id, email, success, ip, user_agent)
                VALUES (%s, %s, true, %s::inet, %s)
                """,
                (user_id, db_email, ip, user_agent),
            )

            conn.commit()

            return AuthResult(
                ok=True,
                user={
                    "user_id": str(user_id),
                    "email": db_email,
                    "nome": nome,
                    "roles": roles,
                    "must_change_pass": bool(must_change_pass),
                },
            )

    except Exception as e:
        if conn:
            conn.rollback()
        return AuthResult(ok=False, message=f"Erro ao autenticar: {e}")
    finally:
        if conn:
            put_conn(conn)
