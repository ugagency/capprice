# app/models/user.py
from __future__ import annotations

from flask import current_app
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import UUID

from app import db


class User(db.Model):
    __tablename__ = "tb_user"
    __table_args__ = {"schema": "cs_app"}

    user_id = db.Column(UUID(as_uuid=True), primary_key=True)
    email = db.Column(db.String(255), nullable=False)
    nome = db.Column(db.String(150), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    @property
    def name(self):
        return self.nome

    def permissions_dict(self) -> dict:
        """
        Retorna permissões por módulo para o app atual (client_id).
        Espera tabela:
          cs_app.tb_user_app_module_perm (ou equivalente)
            user_id (uuid)
            client_id/clientid
            module_key/module
            allowed/is_allowed
        """
        client_id = (current_app.config.get("SSO_CLIENT_ID") or "captransportation").strip()

        # Se usuário desativado, não tem acesso.
        if not self.is_active:
            return {}

        # Detecta tabela e colunas com tolerância.
        try:
            exists = db.session.execute(
                text("""
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema='cs_app' AND table_name='tb_user_app_module_perm'
                    LIMIT 1
                """)
            ).fetchone()
            if not exists:
                return {}
        except Exception:
            return {}

        # Detecta nomes de colunas comuns
        try:
            cols = db.session.execute(
                text("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema='cs_app'
                      AND table_name='tb_user_app_module_perm'
                """)
            ).fetchall()
            cols = {c[0] for c in cols}
        except Exception:
            cols = set()

        client_col = "client_id" if "client_id" in cols else ("clientid" if "clientid" in cols else None)
        module_col = "module_key" if "module_key" in cols else ("module" if "module" in cols else None)
        allowed_col = "allowed" if "allowed" in cols else ("is_allowed" if "is_allowed" in cols else None)

        if not client_col or not module_col:
            return {}

        if not allowed_col:
            # se não existir allowed, assume permitido quando houver linha
            allowed_expr = "true"
        else:
            allowed_expr = f"COALESCE({allowed_col}, true)"

        try:
            rows = db.session.execute(
                text(f"""
                    SELECT {module_col} AS module_key, {allowed_expr} AS allowed
                    FROM cs_app.tb_user_app_module_perm
                    WHERE {client_col} = :cid
                      AND user_id = :uid::uuid
                """),
                {"cid": client_id, "uid": str(self.user_id)},
            ).fetchall()

            perms = {str(mk): bool(alw) for mk, alw in rows if mk}

            # Normalização: se tiver master (caso exista no seu modelo), ele libera tudo
            if perms.get("master") is True:
                perms["permissions"] = True
                perms["mestre"] = True
                perms["comercial"] = True
                perms["programacao"] = True
                perms["industrial"] = True
                perms["laboratorio"] = True
                perms["faturamento"] = True

            return perms
        except Exception:
            return {}
