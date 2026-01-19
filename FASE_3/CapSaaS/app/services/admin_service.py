# app/services/admin_service.py
import secrets
from flask import jsonify

from app.config import get_conn, put_conn


def admin_list_users():
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    u.user_id,
                    u.nome,
                    u.email,
                    u.is_active,
                    u.must_change_pass,
                    COALESCE(string_agg(r.code, ','), '') AS roles
                FROM cs_app.tb_user u
                LEFT JOIN cs_app.tb_user_role ur ON ur.user_id = u.user_id
                LEFT JOIN cs_app.tb_role r ON r.role_id = ur.role_id
                GROUP BY u.user_id
                ORDER BY u.created_at DESC
                """
            )
            rows = cur.fetchall()

        users = []
        for r in rows:
            users.append({
                "user_id": str(r[0]),
                "nome": r[1],
                "email": r[2],
                "is_active": bool(r[3]),
                "must_change_pass": bool(r[4]),
                "roles": [x for x in (r[5] or "").split(",") if x],
            })
        return users
    finally:
        if conn:
            put_conn(conn)


def admin_get_user(user_id: str):
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.user_id, u.nome, u.email, u.is_active, u.must_change_pass,
                       COALESCE(string_agg(r.code, ','), '') AS roles
                FROM cs_app.tb_user u
                LEFT JOIN cs_app.tb_user_role ur ON ur.user_id = u.user_id
                LEFT JOIN cs_app.tb_role r ON r.role_id = ur.role_id
                WHERE u.user_id = %s
                GROUP BY u.user_id
                """,
                (user_id,)
            )
            row = cur.fetchone()

        if not row:
            return None

        return {
            "user_id": str(row[0]),
            "nome": row[1],
            "email": row[2],
            "is_active": bool(row[3]),
            "must_change_pass": bool(row[4]),
            "roles": [x for x in (row[5] or "").split(",") if x],
        }
    finally:
        if conn:
            put_conn(conn)


def admin_list_roles():
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT role_id, code, descricao, is_active
                FROM cs_app.tb_role
                ORDER BY code
                """
            )
            rows = cur.fetchall()

        return [{
            "role_id": str(r[0]),
            "code": r[1],
            "descricao": r[2],
            "is_active": bool(r[3]),
        } for r in rows]
    finally:
        if conn:
            put_conn(conn)


def admin_list_permissions():
    """
    IMPORTANTE:
    Sua tabela cs_app.tb_permission NÃO possui is_active no script do banco.
    Então aqui retornamos is_active=true apenas para manter compatibilidade com o front.
    """
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT perm_id, code, descricao
                FROM cs_app.tb_permission
                ORDER BY code
                """
            )
            rows = cur.fetchall()

        return [{
            "perm_id": str(r[0]),
            "code": r[1],
            "descricao": r[2],
            "is_active": True,
        } for r in rows]
    finally:
        if conn:
            put_conn(conn)


# ===============================
# USERS
# ===============================

def admin_create_user(data: dict):
    nome = (data.get("nome") or "").strip()
    email = (data.get("email") or "").strip()
    role_code = (data.get("role_code") or "USER").strip()
    is_active = bool(data.get("is_active", True))

    temp_password = data.get("temp_password") or ("Tmp#" + secrets.token_hex(4))

    if not nome or not email:
        return jsonify({"ok": False, "message": "Informe nome e email."}), 400

    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO cs_app.tb_user (nome, email, password_hash, must_change_pass, is_active)
                VALUES (%s, %s, public.crypt(%s, public.gen_salt('bf', 10)), true, %s)
                RETURNING user_id
                """,
                (nome, email, temp_password, is_active),
            )
            user_id = cur.fetchone()[0]

            cur.execute(
                "SELECT role_id FROM cs_app.tb_role WHERE upper(code) = upper(%s) AND is_active = true",
                (role_code,),
            )
            r = cur.fetchone()
            if not r:
                raise ValueError(f"Role inválida: {role_code}")

            role_id = r[0]
            cur.execute(
                "INSERT INTO cs_app.tb_user_role (user_id, role_id) VALUES (%s, %s)",
                (user_id, role_id),
            )

        conn.commit()
        return jsonify({"ok": True, "user_id": str(user_id), "temp_password": temp_password}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"ok": False, "message": str(e)}), 400
    finally:
        if conn:
            put_conn(conn)


def admin_update_user(user_id: str, data: dict):
    nome = (data.get("nome") or "").strip()
    email = (data.get("email") or "").strip()
    role_code = (data.get("role_code") or "").strip()
    is_active = data.get("is_active", None)

    if not nome or not email:
        return jsonify({"ok": False, "message": "Informe nome e email."}), 400

    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            if is_active is None:
                cur.execute(
                    """
                    UPDATE cs_app.tb_user
                       SET nome = %s, email = %s
                     WHERE user_id = %s
                    """,
                    (nome, email, user_id),
                )
            else:
                cur.execute(
                    """
                    UPDATE cs_app.tb_user
                       SET nome = %s, email = %s, is_active = %s
                     WHERE user_id = %s
                    """,
                    (nome, email, bool(is_active), user_id),
                )

            if cur.rowcount == 0:
                return jsonify({"ok": False, "message": "Usuário não encontrado"}), 404

            if role_code:
                cur.execute(
                    "SELECT role_id FROM cs_app.tb_role WHERE upper(code) = upper(%s) AND is_active = true",
                    (role_code,),
                )
                r = cur.fetchone()
                if not r:
                    raise ValueError(f"Role inválida: {role_code}")

                role_id = r[0]
                cur.execute("DELETE FROM cs_app.tb_user_role WHERE user_id = %s", (user_id,))
                cur.execute(
                    "INSERT INTO cs_app.tb_user_role (user_id, role_id) VALUES (%s, %s)",
                    (user_id, role_id),
                )

        conn.commit()
        return jsonify({"ok": True}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"ok": False, "message": str(e)}), 400
    finally:
        if conn:
            put_conn(conn)


def admin_toggle_user_active(user_id: str):
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE cs_app.tb_user
                   SET is_active = NOT is_active
                 WHERE user_id = %s
                """,
                (user_id,),
            )
            if cur.rowcount == 0:
                return jsonify({"ok": False, "message": "Usuário não encontrado"}), 404

        conn.commit()
        return jsonify({"ok": True}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"ok": False, "message": str(e)}), 400
    finally:
        if conn:
            put_conn(conn)


def admin_reset_password(user_id: str, data: dict):
    new_password = (data.get("new_password") or "").strip()
    if not new_password:
        new_password = "Tmp#" + secrets.token_hex(4)

    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE cs_app.tb_user
                SET password_hash = public.crypt(%s, public.gen_salt('bf', 10)),
                    must_change_pass = true
                WHERE user_id = %s
                """,
                (new_password, user_id),
            )
            if cur.rowcount == 0:
                return jsonify({"ok": False, "message": "Usuário não encontrado"}), 404

        conn.commit()
        return jsonify({"ok": True, "temp_password": new_password}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"ok": False, "message": str(e)}), 400
    finally:
        if conn:
            put_conn(conn)


# ===============================
# ROLES / NÍVEIS
# ===============================

def admin_create_role(data: dict):
    code = (data.get("code") or "").strip()
    descricao = (data.get("descricao") or "").strip()
    is_active = bool(data.get("is_active", True))

    if not code or not descricao:
        return jsonify({"ok": False, "message": "Informe código e descrição do nível."}), 400

    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO cs_app.tb_role (code, descricao, is_active)
                VALUES (%s, %s, %s)
                RETURNING role_id
                """,
                (code, descricao, is_active),
            )
            role_id = cur.fetchone()[0]

        conn.commit()
        return jsonify({"ok": True, "role_id": str(role_id)}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"ok": False, "message": str(e)}), 400
    finally:
        if conn:
            put_conn(conn)


def admin_update_role(role_id: str, data: dict):
    code = (data.get("code") or "").strip()
    descricao = (data.get("descricao") or "").strip()
    is_active = data.get("is_active", None)

    if not code or not descricao:
        return jsonify({"ok": False, "message": "Informe código e descrição do nível."}), 400

    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            if is_active is None:
                cur.execute(
                    """
                    UPDATE cs_app.tb_role
                       SET code = %s, descricao = %s
                     WHERE role_id = %s
                    """,
                    (code, descricao, role_id),
                )
            else:
                cur.execute(
                    """
                    UPDATE cs_app.tb_role
                       SET code = %s, descricao = %s, is_active = %s
                     WHERE role_id = %s
                    """,
                    (code, descricao, bool(is_active), role_id),
                )

            if cur.rowcount == 0:
                return jsonify({"ok": False, "message": "Nível não encontrado"}), 404

        conn.commit()
        return jsonify({"ok": True}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"ok": False, "message": str(e)}), 400
    finally:
        if conn:
            put_conn(conn)


def admin_toggle_role_active(role_id: str):
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE cs_app.tb_role
                   SET is_active = NOT is_active
                 WHERE role_id = %s
                """,
                (role_id,),
            )
            if cur.rowcount == 0:
                return jsonify({"ok": False, "message": "Nível não encontrado"}), 404

        conn.commit()
        return jsonify({"ok": True}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"ok": False, "message": str(e)}), 400
    finally:
        if conn:
            put_conn(conn)


def admin_get_role_permissions(role_id: str):
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT perm_id
                FROM cs_app.tb_role_permission
                WHERE role_id = %s
                """,
                (role_id,),
            )
            rows = cur.fetchall()

        return [str(r[0]) for r in rows]
    finally:
        if conn:
            put_conn(conn)


def admin_set_role_permissions(role_id: str, perm_ids: list):
    """
    Correção do erro: operador não existe: uuid = text
    - perm_ids vem do frontend como lista de strings
    - perm_id no banco é UUID
    => fazemos CAST explícito para uuid[]
    """
    perm_ids = perm_ids or []
    if not isinstance(perm_ids, list):
        return jsonify({"ok": False, "message": "perm_ids deve ser uma lista."}), 400

    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            # valida role
            cur.execute("SELECT 1 FROM cs_app.tb_role WHERE role_id = %s", (role_id,))
            if not cur.fetchone():
                return jsonify({"ok": False, "message": "Nível não encontrado"}), 404

            # valida permissões (CAST explícito)
            if perm_ids:
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM cs_app.tb_permission
                    WHERE perm_id = ANY(%s::uuid[])
                    """,
                    (perm_ids,),
                )
                cnt = cur.fetchone()[0]
                if cnt != len(perm_ids):
                    return jsonify({"ok": False, "message": "Uma ou mais permissões são inválidas."}), 400

            # reseta vínculos
            cur.execute(
                "DELETE FROM cs_app.tb_role_permission WHERE role_id = %s",
                (role_id,),
            )

            # recria vínculos (CAST explícito por item)
            if perm_ids:
                cur.executemany(
                    """
                    INSERT INTO cs_app.tb_role_permission (role_id, perm_id)
                    VALUES (%s, %s::uuid)
                    """,
                    [(role_id, pid) for pid in perm_ids],
                )

        conn.commit()
        return jsonify({"ok": True}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"ok": False, "message": str(e)}), 400
    finally:
        if conn:
            put_conn(conn)


def admin_delete_role(role_id: str):
    """
    Exclui nível com proteção:
    - não permite excluir se houver usuário vinculado (tb_user_role)
    - remove vínculos de permissões (tb_role_permission) antes de excluir
    """
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            # bloqueia se houver usuários vinculados
            cur.execute(
                "SELECT 1 FROM cs_app.tb_user_role WHERE role_id = %s LIMIT 1",
                (role_id,),
            )
            if cur.fetchone():
                return jsonify({
                    "ok": False,
                    "message": "Não é possível excluir: nível vinculado a usuários."
                }), 400

            # remove vínculos de permissões
            cur.execute(
                "DELETE FROM cs_app.tb_role_permission WHERE role_id = %s",
                (role_id,),
            )

            # exclui o nível
            cur.execute(
                "DELETE FROM cs_app.tb_role WHERE role_id = %s",
                (role_id,),
            )
            if cur.rowcount == 0:
                return jsonify({"ok": False, "message": "Nível não encontrado."}), 404

        conn.commit()
        return jsonify({"ok": True}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"ok": False, "message": str(e)}), 400
    finally:
        if conn:
            put_conn(conn)
