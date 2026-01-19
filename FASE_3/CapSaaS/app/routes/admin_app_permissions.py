# app/routes/admin_app_permissions.py
from flask import Blueprint, request, jsonify
from app.config import get_conn, put_conn

admin_app_perms_api = Blueprint("admin_app_perms_api", __name__)

def _json_error(message: str, status: int = 400):
    return jsonify({"ok": False, "error": message}), status


@admin_app_perms_api.get("/api/admin/apps/<client_id>/modules")
def list_app_modules(client_id):
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT module_key, module_label, enabled
                FROM cs_app.tb_app_module
                WHERE client_id = %s
                ORDER BY module_label ASC
                """,
                (client_id,),
            )
            rows = cur.fetchall()

        return jsonify([{"key": r[0], "label": r[1], "enabled": bool(r[2])} for r in rows])

    except Exception as e:
        print(f"[admin_app_permissions] ERRO (modules): {e}")
        return _json_error(str(e), 500)
    finally:
        if conn:
            put_conn(conn)


@admin_app_perms_api.get("/api/admin/apps/<client_id>/users")
def list_app_users(client_id):
    busca = (request.args.get("busca") or "").strip().lower()
    limit = int(request.args.get("limit") or 200)

    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            sql = """
                SELECT user_id::text, nome, email
                FROM cs_app.tb_user
                WHERE is_active = true
            """
            params = []

            if busca:
                sql += """
                  AND (
                      LOWER(email) LIKE %s
                      OR LOWER(nome) LIKE %s
                  )
                """
                params.extend([f"%{busca}%", f"%{busca}%"])

            sql += " ORDER BY nome ASC, email ASC LIMIT %s"
            params.append(limit)

            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

        items = [{"id": r[0], "name": r[1] or r[2] or "-", "email": r[2] or ""} for r in rows]
        return jsonify({"items": items})

    except Exception as e:
        print(f"[admin_app_permissions] ERRO (users): {e}")
        return _json_error(str(e), 500)
    finally:
        if conn:
            put_conn(conn)


@admin_app_perms_api.get("/api/admin/apps/<client_id>/users/<user_id>/permissions")
def get_user_permissions(client_id, user_id):
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT module_key, module_label
                FROM cs_app.tb_app_module
                WHERE client_id = %s AND enabled = true
                ORDER BY module_label ASC
                """,
                (client_id,),
            )
            modules = [{"module_key": r[0], "module_label": r[1]} for r in cur.fetchall()]

            # leitura das permissões gravadas
            cur.execute(
                """
                SELECT module_key, COALESCE(allowed, true)
                FROM cs_app.tb_user_app_module_perm
                WHERE client_id = %s AND user_id = %s::uuid
                """,
                (client_id, str(user_id)),
            )
            permissions = {r[0]: bool(r[1]) for r in cur.fetchall()}

        return jsonify({"modules": modules, "permissions": permissions})

    except Exception as e:
        print(f"[admin_app_permissions] ERRO (get permissions): {e}")
        return _json_error(str(e), 500)
    finally:
        if conn:
            put_conn(conn)


@admin_app_perms_api.put("/api/admin/apps/<client_id>/users/<user_id>/permissions")
def put_user_permissions(client_id, user_id):
    payload = request.get_json(silent=True) or {}
    permissions = payload.get("permissions")

    if not isinstance(permissions, dict):
        return _json_error("Body inválido. Envie { permissions: {module_key: boolean} }", 400)

    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            # UPSERT por (client_id, user_id, module_key) — requer PK/unique nessa combinação
            for module_key, allowed in permissions.items():
                if not isinstance(module_key, str) or not module_key.strip():
                    continue

                cur.execute(
                    """
                    INSERT INTO cs_app.tb_user_app_module_perm (client_id, user_id, module_key, allowed)
                    VALUES (%s, %s::uuid, %s, %s)
                    ON CONFLICT (client_id, user_id, module_key)
                    DO UPDATE SET allowed = EXCLUDED.allowed
                    """,
                    (client_id, str(user_id), module_key.strip(), bool(allowed)),
                )

        conn.commit()
        return jsonify({"ok": True})

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[admin_app_permissions] ERRO (put permissions): {e}")
        return _json_error(str(e), 500)
    finally:
        if conn:
            put_conn(conn)
