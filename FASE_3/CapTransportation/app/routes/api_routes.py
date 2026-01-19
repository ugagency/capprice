# app/routes/api_routes.py
from __future__ import annotations

from datetime import datetime, date
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request, current_app, g

from app import db
from app.models.pedido import Pedido

# IMPORTANTE:
# NÃO usar url_prefix aqui, porque o prefixo já é aplicado em app.register_blueprint(..., url_prefix="/api")
api_bp = Blueprint("api_bp", __name__)

# ==========================================================
# MOCK STORAGE (em memória) - só usado se MOCK_MODE=1
# ==========================================================
_PEDIDOS = [
    {
        "id": 1,
        "chave": "PED-0001",
        "status": "comercial",
        "data": "2025-12-29",
        "ov_remessa": "OV-10001",
        "cif_fob": "CIF",
        "cliente": "ACME LTDA",
        "produto": "CAP 50/70",
        "local_entrega": "Belo Horizonte",
        "uf_entrega": "MG",
        "qtde_solicitada": 30,
        "assessor": "João",
        "assistente": "Ana",
        "refinaria": "Refinaria A",
        "agendamento_refinaria": "",
        "hora_agendamento": "",
        "transportador": "Trans A",
        "placa_cavalo": "",
        "placa_carreta": "",
        "motorista": "",
        "solicitacao_remessa": "",
        "nova_data_ov_venda": "",
        "pedido_remessa": "",
        "hora_chegada": "",
        "hora_entrada": "",
        "hora_saida": "",
        "confirmacao_pedido_remessa": "",
        "lacres": "",
        "lote": "",
        "deposito": "",
        "qtde_carregada": "",
        "ca": "",
        "data_liberacao": "",
        "obs_laboratorio": "",
        "faturista": "",
        "problema_faturar": "",
        "numero_nf": "",
        "data_faturamento": "",
        "valor_faturado": "",
        "chave_nfe": "",
        "obs_faturamento": "",
    }
]
_NEXT_ID = 2

FLOW = ["comercial", "programacao", "industrial", "laboratorio", "faturamento", "finalizado"]


# ==========================================================
# RBAC helpers (compatível com SSO: g.user como dict)
# ==========================================================
def _user_dict() -> dict:
    u = getattr(g, "user", None)
    return u if isinstance(u, dict) else {}


def _perms_dict() -> dict:
    """
    Suporta 2 formatos:
      1) Novo (SSO): g.user é dict e contém permissions (dict)
      2) Legado: g.user é objeto com método permissions_dict()
    """
    u = getattr(g, "user", None)

    # Novo: dict
    if isinstance(u, dict):
        p = u.get("permissions") or {}
        return p if isinstance(p, dict) else {}

    # Legado: objeto
    if u and hasattr(u, "permissions_dict"):
        try:
            p = u.permissions_dict() or {}
            return p if isinstance(p, dict) else {}
        except Exception:
            return {}

    return {}


def _is_authenticated() -> bool:
    u = getattr(g, "user", None)
    if isinstance(u, dict):
        return bool(u.get("user_id"))
    return bool(u)


def _has_access(module: str) -> bool:
    """
    master sempre passa.
    """
    perms = _perms_dict()
    if perms.get("master"):
        return True
    if not module:
        return False
    return bool(perms.get(module))


def _deny():
    return jsonify({"error": "Acesso negado"}), 403


def _require_any(*modules: str):
    """
    Permite se tiver acesso a qualquer um dos módulos.
    """
    for m in modules:
        if _has_access(m):
            return None
    return _deny()


def _require_admin_permissions():
    perms = _perms_dict()
    return bool(perms.get("master") or perms.get("permissions"))


# ==========================================================
# Utils
# ==========================================================
def _next_status(current: str) -> str:
    cur = (current or "comercial").strip().lower()
    if cur not in FLOW:
        return "programacao"
    idx = FLOW.index(cur)
    return FLOW[min(idx + 1, len(FLOW) - 1)]


def _find_pedido_mock(pedido_id: int):
    for p in _PEDIDOS:
        if p.get("id") == pedido_id:
            return p
    return None


def _gen_chave(pedido_id: int) -> str:
    return f"PED-{pedido_id:04d}"


def _parse_date(v) -> date | None:
    if v is None:
        return None
    if isinstance(v, date):
        return v
    if not isinstance(v, str):
        return None
    s = v.strip()
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


def _parse_decimal(v) -> Decimal | None:
    if v is None:
        return None
    if isinstance(v, Decimal):
        return v
    if isinstance(v, (int, float)):
        return Decimal(str(v))
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        s = s.replace(",", ".")
        try:
            return Decimal(s)
        except (InvalidOperation, ValueError):
            return None
    return None


# ==========================================================
# AUXILIARES (para selects do front)
# ==========================================================
@api_bp.get("/auxiliares")
def auxiliares():
    # Apenas autenticado. (Permissão por tela será aplicada na operação em si.)
    if not _is_authenticated():
        return _deny()

    return jsonify({
        "cif_fob": [
            {"value": "CIF", "label": "CIF"},
            {"value": "FOB", "label": "FOB"},
        ],
        "produtos": [
            {"value": "CAP 30/45", "label": "CAP 30/45"},
            {"value": "CAP 50/70", "label": "CAP 50/70"},
            {"value": "CM-30", "label": "CM-30"},
            {"value": "AB08", "label": "AB08"},
            {"value": "AB22", "label": "AB22"},
        ],
        "ufs": [{"value": uf, "label": uf} for uf in [
            "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO",
            "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
            "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"
        ]],
        "assessores": [
            {"value": "João", "label": "João"},
            {"value": "Marcos", "label": "Marcos"},
            {"value": "Paula", "label": "Paula"},
        ],
        "assistentes": [
            {"value": "Ana", "label": "Ana"},
            {"value": "Lia", "label": "Lia"},
            {"value": "Rafa", "label": "Rafa"},
        ],
        "refinarias": [
            {"value": "Refinaria A", "label": "Refinaria A"},
            {"value": "Refinaria B", "label": "Refinaria B"},
            {"value": "Refinaria C", "label": "Refinaria C"},
        ],
        "transportadores": [
            {"value": "Trans A", "label": "Trans A"},
            {"value": "Trans B", "label": "Trans B"},
            {"value": "Trans C", "label": "Trans C"},
        ],
        "confirmacoes": [
            {"value": "sim", "label": "Sim"},
            {"value": "nao", "label": "Não"},
        ],
        "faturistas": [
            {"value": "Fat 1", "label": "Fat 1"},
            {"value": "Fat 2", "label": "Fat 2"},
        ],
        "problemas_faturar": [
            {"value": "", "label": "Sem problema"},
            {"value": "cadastro", "label": "Cadastro incompleto"},
            {"value": "documento", "label": "Documento pendente"},
            {"value": "preco", "label": "Divergência de preço"},
        ],
    })


# ==========================================================
# ADMIN - USERS / PERMISSIONS
# (Cap Transportation NÃO deve administrar usuários localmente.
#  Admin de usuários/perms fica no CAPSSYS.)
# ==========================================================
@api_bp.get("/admin/users")
def admin_list_users():
    if not _require_admin_permissions():
        return _deny()
    # Mantém compatibilidade sem quebrar telas antigas:
    return jsonify({"items": [], "note": "Admin de usuários centralizado no CAPSSYS"})


@api_bp.put("/admin/users/<int:user_id>/permissions")
def admin_update_user_permissions(user_id: int):
    if not _require_admin_permissions():
        return _deny()
    return jsonify({"error": "Admin de permissões centralizado no CAPSSYS"}), 501


# ==========================================================
# PEDIDOS (LISTAGEM + CRUD)
# ==========================================================
@api_bp.get("/pedidos")
def listar_pedidos():
    busca = (request.args.get("busca") or "").strip()
    stage = (request.args.get("stage") or "").strip().lower()

    # RBAC para listagem:
    # - mestre (ou vazio): precisa mestre/master
    # - stage específico: precisa stage OU mestre/master
    if not stage or stage == "mestre":
        denied = _require_any("mestre")
        if denied:
            return denied
    else:
        denied = _require_any(stage, "mestre")
        if denied:
            return denied

    if current_app.config.get("MOCK_MODE", False):
        items = list(_PEDIDOS)

        if stage and stage != "mestre":
            items = [p for p in items if (p.get("status") == stage)]

        if busca:
            b = busca.lower()

            def match(p):
                fields = [
                    p.get("chave", ""),
                    p.get("ov_remessa", ""),
                    p.get("cliente", ""),
                    p.get("produto", ""),
                    p.get("status", ""),
                ]
                blob = " ".join(str(x) for x in fields).lower()
                return b in blob

            items = [p for p in items if match(p)]

        items.sort(key=lambda x: x.get("id", 0), reverse=True)
        return jsonify({"items": items})

    q = Pedido.query

    if stage and stage != "mestre":
        q = q.filter(Pedido.status == stage)

    if busca:
        like = f"%{busca}%"
        q = q.filter(
            (Pedido.chave.ilike(like)) |
            (Pedido.ov_remessa.ilike(like)) |
            (Pedido.cliente.ilike(like)) |
            (Pedido.produto.ilike(like)) |
            (Pedido.status.ilike(like))
        )

    pedidos = q.order_by(Pedido.id.desc()).all()
    return jsonify({"items": [p.to_dict() for p in pedidos]})


@api_bp.get("/pedidos/<int:pedido_id>")
def obter_pedido(pedido_id: int):
    if current_app.config.get("MOCK_MODE", False):
        p = _find_pedido_mock(pedido_id)
        if not p:
            return jsonify({"error": "Pedido não encontrado"}), 404

        status = str(p.get("status") or "").lower()
        denied = _require_any(status, "mestre")
        if denied:
            return denied

        return jsonify({"item": p})

    p = Pedido.query.get(pedido_id)
    if not p:
        return jsonify({"error": "Pedido não encontrado"}), 404

    status = str(p.status or "").lower()
    denied = _require_any(status, "mestre")
    if denied:
        return denied

    return jsonify({"item": p.to_dict()})


@api_bp.post("/pedidos")
def criar_pedido():
    # criar pedido: comercial ou mestre/master
    denied = _require_any("comercial", "mestre")
    if denied:
        return denied

    payload = request.get_json(silent=True) or {}

    if current_app.config.get("MOCK_MODE", False):
        global _NEXT_ID
        new_id = _NEXT_ID
        _NEXT_ID += 1
        novo = dict(payload)
        novo["id"] = new_id
        novo["chave"] = novo.get("chave") or _gen_chave(new_id)
        novo["status"] = (novo.get("status") or "comercial").lower()
        _PEDIDOS.append(novo)
        return jsonify({"item": novo}), 201

    p = Pedido()
    p.status = (payload.get("status") or "comercial").lower()

    date_fields = {"data", "nova_data_ov_venda", "data_liberacao", "data_faturamento"}
    dec_fields = {"qtde_solicitada", "qtde_carregada", "valor_faturado"}

    allowed = set(Pedido.__table__.columns.keys()) - {"id"}

    for k, v in payload.items():
        if k not in allowed:
            continue
        if k in date_fields:
            setattr(p, k, _parse_date(v))
        elif k in dec_fields:
            setattr(p, k, _parse_decimal(v))
        else:
            setattr(p, k, v)

    db.session.add(p)
    db.session.flush()

    if not p.chave:
        p.chave = _gen_chave(int(p.id))

    db.session.commit()
    return jsonify({"item": p.to_dict()}), 201


@api_bp.put("/pedidos/<int:pedido_id>")
def atualizar_pedido(pedido_id: int):
    payload = request.get_json(silent=True) or {}

    if current_app.config.get("MOCK_MODE", False):
        p = _find_pedido_mock(pedido_id)
        if not p:
            return jsonify({"error": "Pedido não encontrado"}), 404

        current_status = str(p.get("status") or "").lower()
        denied = _require_any(current_status, "mestre")
        if denied:
            return denied

        # Se tentar alterar status via PUT: só mestre/master
        if "status" in payload and not _has_access("mestre"):
            payload.pop("status", None)

        for k, v in payload.items():
            if k in ("id",):
                continue
            p[k] = v

        if not p.get("chave"):
            p["chave"] = _gen_chave(pedido_id)

        if p.get("status"):
            p["status"] = str(p["status"]).lower()

        return jsonify({"item": p})

    p = Pedido.query.get(pedido_id)
    if not p:
        return jsonify({"error": "Pedido não encontrado"}), 404

    current_status = str(p.status or "").lower()
    denied = _require_any(current_status, "mestre")
    if denied:
        return denied

    # Se tentar alterar status via PUT: só mestre/master (recomendado usar /advance)
    if "status" in payload and not _has_access("mestre"):
        payload.pop("status", None)

    date_fields = {"data", "nova_data_ov_venda", "data_liberacao", "data_faturamento"}
    dec_fields = {"qtde_solicitada", "qtde_carregada", "valor_faturado"}

    allowed = set(Pedido.__table__.columns.keys()) - {"id"}

    for k, v in payload.items():
        if k not in allowed:
            continue
        if k in date_fields:
            setattr(p, k, _parse_date(v))
        elif k in dec_fields:
            setattr(p, k, _parse_decimal(v))
        else:
            setattr(p, k, v)

    if p.status:
        p.status = str(p.status).lower()

    db.session.commit()
    return jsonify({"item": p.to_dict()})


# ==========================================================
# ADVANCE (ENVIA PARA PRÓXIMA FILA)
# ==========================================================
@api_bp.post("/pedidos/<int:pedido_id>/advance")
def avancar_pedido(pedido_id: int):
    if current_app.config.get("MOCK_MODE", False):
        p = _find_pedido_mock(pedido_id)
        if not p:
            return jsonify({"error": "Pedido não encontrado"}), 404

        cur = (p.get("status") or "comercial").lower()
        denied = _require_any(cur, "mestre")
        if denied:
            return denied

        nxt = _next_status(cur)
        p["status"] = nxt
        return jsonify({"item": p, "from": cur, "to": nxt})

    p = Pedido.query.get(pedido_id)
    if not p:
        return jsonify({"error": "Pedido não encontrado"}), 404

    cur = (p.status or "comercial").lower()
    denied = _require_any(cur, "mestre")
    if denied:
        return denied

    nxt = _next_status(cur)

    p.status = nxt
    db.session.commit()

    return jsonify({"item": p.to_dict(), "from": cur, "to": nxt})
