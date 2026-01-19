# app/services/module_service.py
from app.config import get_conn, put_conn


def list_user_modules(user_id: str):
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT
                    m.code,
                    m.nome,
                    m.descricao,
                    m.route_path,
                    COALESCE(m.icon_key, '') AS icon_key
                FROM cs_app.tb_module m
                JOIN cs_app.tb_role_module rm ON rm.module_id = m.module_id
                JOIN cs_app.tb_user_role ur ON ur.role_id = rm.role_id
                WHERE ur.user_id = %s
                  AND m.is_active = true
                ORDER BY m.nome
                """,
                (user_id,),
            )
            rows = cur.fetchall()

        return [
            {
                "code": r[0],
                "nome": r[1],
                "descricao": r[2],
                "route_path": r[3],
                "icon_key": r[4],
            }
            for r in rows
        ]
    finally:
        if conn:
            put_conn(conn)
