# app/routes/main.py
from flask import Blueprint, render_template, jsonify, request, redirect, session
import requests
import os
import json
import jwt

# 👇 Laudo
from .laudo_precificacao import gerar_laudo_para_resposta_simulacao

# 👇 Guard de sessão
from app.security.guards import login_required

main_bp = Blueprint("main", __name__)

# ============================================================
# Config: URLs dos workflows do n8n
# ============================================================
N8N_SIMULATOR_WEBHOOK_URL = os.getenv(
    "N8N_SIMULATOR_WEBHOOK_URL",
    "https://automacoes-n8n.infrassys.com/webhook/CPV5x",
)

N8N_CHAT_WEBHOOK_URL = os.getenv(
    "N8N_CHAT_WEBHOOK_URL",
    "https://automacoes-n8n.infrassys.com/webhook/capchat",
)

# ============================================================
# SSO (CAPSSYS)
# ============================================================
CAPSSYS_INTERNAL_BASE_URL = os.getenv("CAPSSYS_INTERNAL_BASE_URL", "").rstrip("/")
CAPSSYS_PUBLIC_URL = os.getenv("CAPSSYS_PUBLIC_URL", "").rstrip("/")

SSO_CLIENT_ID = os.getenv("SSO_CLIENT_ID", "capprice")
SSO_CLIENT_SECRET = os.getenv("SSO_CLIENT_SECRET", "")

SSO_JWT_SECRET = os.getenv("SSO_JWT_SECRET", "")
SSO_ISSUER = os.getenv("SSO_ISSUER", "")
SSO_AUDIENCE = os.getenv("SSO_AUDIENCE", "")


# ============================================================
# Helpers
# ============================================================
def _mapear_resultados_simulacao(n8n_json):
    """
    Converte a resposta do n8n para o formato que o frontend espera.
    [ ... SEU TEXTO ORIGINAL AQUI (mantive igual) ... ]
    """

    def _find_first_list(obj, key_name):
        """Procura recursivamente pela primeira lista em obj com a chave key_name."""
        if isinstance(obj, dict):
            if key_name in obj and isinstance(obj[key_name], list):
                return obj[key_name], obj
            for v in obj.values():
                lst, owner = _find_first_list(v, key_name)
                if lst is not None:
                    return lst, owner
        elif isinstance(obj, list):
            for it in obj:
                lst, owner = _find_first_list(it, key_name)
                if lst is not None:
                    return lst, owner
        return None, None

    # ---------- Normaliza raiz ----------
    raiz = n8n_json
    if isinstance(raiz, list) and raiz and isinstance(raiz[0], dict):
        raiz = raiz[0]

    # ---------- Descobre de onde vêm os cenários/jsons ----------
    jsons = []
    owner = None

    # 1) Tenta achar "jsons" (formato antigo)
    jsons, owner = _find_first_list(n8n_json, "jsons")
    # 2) Se não achou, tenta "cenarios" (formato novo)
    if not jsons:
        jsons, owner = _find_first_list(n8n_json, "cenarios")
    # 3) Se ainda não achou, tenta "results"
    if not jsons:
        jsons, owner = _find_first_list(n8n_json, "results")

    # 4) Fallback: se n8n_json já for lista de objetos simples
    if not jsons:
        if isinstance(n8n_json, list):
            jsons = [it for it in n8n_json if isinstance(it, dict)]
        elif isinstance(n8n_json, dict):
            jsons = [n8n_json]

    if not jsons:
        return []

    # ---------- Descobre os htmls (laudo) ----------
    raw_htmls = None

    # Se o "owner" (dict que contém jsons/cenarios) tiver htmls, usa ele
    if isinstance(owner, dict) and "htmls" in owner:
        raw_htmls = owner.get("htmls")

    # Se não tiver, tenta na raiz
    if raw_htmls is None and isinstance(raiz, dict):
        raw_htmls = raiz.get("htmls")

    # Fallback geral: percorre procurando key "htmls"
    if raw_htmls is None:
        _, owner_html = _find_first_list(n8n_json, "htmls")
        if isinstance(owner_html, dict):
            raw_htmls = owner_html.get("htmls")

    # ---------- Normaliza laudo HTML ----------
    laudo_html = None
    if isinstance(raw_htmls, list) and raw_htmls:
        first = raw_htmls[0]
        if isinstance(first, str):
            laudo_html = first
        elif isinstance(first, dict):
            laudo_html = (
                first.get("html")
                or first.get("content")
                or first.get("body")
            )
    elif isinstance(raw_htmls, dict):
        laudo_html = (
            raw_htmls.get("html")
            or raw_htmls.get("content")
            or raw_htmls.get("body")
        )

    # ---------- Monta o array no formato que o front espera ----------
    resultados = []

    for item in jsons:
        if not isinstance(item, dict):
            continue

        def _num(val, default=0.0):
            try:
                return float(val)
            except (TypeError, ValueError):
                return default

        origem = (
            item.get("origem")
            or item.get("refinariaNome")
            or item.get("refinaria_nome")
            or item.get("refinaria_codigo")
            or "Origem não informada"
        )

        destino = (
            item.get("destino")
            or item.get("destinoCidade")
            or ""
        )

        quantidade = item.get("quantidade") or raiz.get("quantidade") or 0

        preco_net = (
            item.get("precoNet")
            or item.get("preco_net")
            or 0
        )

        frete = (
            item.get("frete")
            or item.get("frete_por_ton")
            or 0
        )

        cmv = (
            item.get("cmv")
            or item.get("CMV")
            or item.get("preco_com_margem")
            or 0
        )

        margem = (
            item.get("margem")
            or item.get("margem_percentual")
            or 0
        )

        preco_final = (
            item.get("precoFinal")
            or item.get("preco_final")
            or item.get("preco_final_unitario")
            or 0
        )

        valor_total = (
            item.get("valorTotal")
            or item.get("valor_total")
            or 0
        )

        resultado = {
            "origem": origem,
            "destino": destino,
            "quantidade": quantidade,
            "precoNet": _num(preco_net),
            "frete": _num(frete),
            "impostos": _num(item.get("impostos")),
            "difal": _num(item.get("difal")),
            "cmv": _num(cmv),
            "margem": _num(margem),
            "precoFinal": _num(preco_final),
            "produto": item.get("produto") or raiz.get("produto") or "",
            "destinoCidade": item.get("destinoCidade") or raiz.get("destinoCidade") or "",
            "destinoUF": item.get("destinoUF") or raiz.get("destinoUF") or "",
            "refinariaNome": item.get("refinariaNome") or item.get("refinaria_nome") or "",
            "filialRecomendada": item.get("filialRecomendada") or "",
            "distanciaKm": _num(item.get("distanciaKm")),
            "custoFixo": _num(item.get("custoFixo") or item.get("custo_fixo")),
            "valorTotal": _num(valor_total),
        }

        # 👇 Aqui o laudo entra na resposta que o front enxerga
        if laudo_html:
            resultado["laudoHtml"] = laudo_html

        resultados.append(resultado)

    return resultados


# ============================================================
# Rotas SSO
# ============================================================
@main_bp.route("/sso/callback")
def sso_callback():
    code = (request.args.get("code") or "").strip()
    state = (request.args.get("state") or "").strip()  # opcional, mas mantido

    if not code:
        return "SSO inválido: code ausente", 400

    if not CAPSSYS_INTERNAL_BASE_URL:
        return "SSO inválido: CAPSSYS_INTERNAL_BASE_URL não configurada", 500

    try:
        r = requests.post(
            f"{CAPSSYS_INTERNAL_BASE_URL}/api/sso/exchange",
            json={
                "code": code,
                "client_id": SSO_CLIENT_ID,
                "client_secret": SSO_CLIENT_SECRET,
                "state": state,  # se o CAPSSYS ignorar, ok
            },
            timeout=10,
        )
    except requests.RequestException as e:
        return f"Falha de conexão no SSO exchange: {str(e)}", 502

    if not r.ok:
        try:
            err_data = r.json()
            err_msg = err_data.get("message", "Sem mensagem de erro")
            return f"Falha no SSO exchange (Status {r.status_code}): {err_msg}", r.status_code
        except:
            return f"Falha no SSO exchange (Status {r.status_code})", r.status_code

    token = (r.json() or {}).get("access_token")
    if not token:
        return "Token ausente", 401

    try:
        payload = jwt.decode(
            token,
            SSO_JWT_SECRET,
            algorithms=["HS256"],
            issuer=SSO_ISSUER,
            audience=SSO_AUDIENCE,
        )
    except Exception as e:
        return f"JWT inválido: {str(e)}", 401

    session["user"] = {
        "user_id": payload.get("sub"),
        "roles": payload.get("roles", []),
        "email": payload.get("email"),
    }

    return redirect("/precificar")


# ============================================================
# Rotas de páginas (HTML)
# ============================================================
@main_bp.route("/")
@main_bp.route("/login")
def login():
    """
    CAP PRICE não tem login próprio.
    Sempre redireciona para CAPSSYS (plataformas).
    """
    if not CAPSSYS_PUBLIC_URL:
        return "CAPSSYS_PUBLIC_URL não configurada", 500
    return redirect(f"{CAPSSYS_PUBLIC_URL}/plataformas")


@main_bp.route("/logout")
def logout():
    session.clear()
    if not CAPSSYS_PUBLIC_URL:
        return redirect("/login")
    return redirect(f"{CAPSSYS_PUBLIC_URL}/plataformas")


@main_bp.route("/precificar")
@login_required
def precificar():
    """Renderiza a página principal (precificador)."""
    return render_template("pages/precificar.html")


# ============================================================
# API de simulação
# ============================================================
@main_bp.route("/api/simular", methods=["POST"])
@login_required
def api_simular():
    try:
        payload = request.get_json(silent=True) or {}
        print(f"[SIMULACAO] Payload recebido do frontend: {payload}")

        try:
            n8n_response = requests.post(
                N8N_SIMULATOR_WEBHOOK_URL,
                json=payload,
                timeout=240,
            )
        except requests.exceptions.Timeout:
            print("[SIMULACAO] Timeout ao chamar o n8n.")
            return jsonify({
                "status": "error",
                "message": "O motor de simulação demorou demais para responder."
            }), 504
        except requests.exceptions.RequestException as e:
            print(f"[SIMULACAO] Erro de requisição ao n8n: {e}")
            return jsonify({
                "status": "error",
                "message": f"Falha ao conectar no motor de simulação: {str(e)}"
            }), 502

        status_code = n8n_response.status_code
        raw_body = n8n_response.text or ""
        print(f"[SIMULACAO] HTTP {status_code} do n8n. Corpo (primeiros 500 chars): {raw_body[:500]}")

        if not n8n_response.ok:
            return jsonify({
                "status": "error",
                "message": f"Erro ao chamar o motor de simulação (HTTP {status_code}).",
                "raw": raw_body
            }), 502

        if not raw_body.strip():
            print("[SIMULACAO] Resposta vazia do n8n.")
            return jsonify({
                "status": "error",
                "message": "O motor de simulação respondeu vazio (sem JSON).",
                "raw": raw_body
            }), 502

        try:
            n8n_json = n8n_response.json()
        except json.JSONDecodeError:
            print(f"[SIMULACAO] Resposta não-JSON do n8n: {raw_body[:500]}")
            return jsonify({
                "status": "error",
                "message": "Resposta inválida do motor de simulação (não é JSON).",
                "raw": raw_body
            }), 502

        # 👇 AQUI: gera o laudo e insere em "htmls" no payload do n8n
        n8n_json_com_laudo = gerar_laudo_para_resposta_simulacao(n8n_json)

        # Depois disso, o mapper continua o fluxo normal
        simulation_results = _mapear_resultados_simulacao(n8n_json_com_laudo)

        if not simulation_results:
            print(f"[SIMULACAO] JSON recebido, mas sem cenários válidos: {n8n_json_com_laudo}")
            return jsonify({
                "status": "error",
                "message": "Resposta do motor de simulação não contém cenários válidos.",
                "raw": n8n_json_com_laudo
            }), 502

        print(f"[SIMULACAO] Cenários mapeados: {simulation_results}")
        return jsonify(simulation_results), 200

    except Exception as e:
        print(f"[SIMULACAO] Erro inesperado: {e}")
        return jsonify({
            "status": "error",
            "message": f"Erro interno na simulação: {str(e)}"
        }), 500


# ============================================================
# API de chat
# ============================================================
@main_bp.route("/api/chat", methods=["POST"])
@login_required
def api_chat():
    try:
        data = request.get_json(silent=True) or {}
        user_message = data.get("message")
        session_id = data.get("session_id", "default_web_session")

        if not user_message:
            return jsonify({"reply": "Mensagem está vazia."}), 400

        payload_para_n8n = {
            "message": user_message,
            "session_id": session_id,
        }

        try:
            n8n_response = requests.post(
                N8N_CHAT_WEBHOOK_URL,
                json=payload_para_n8n,
                timeout=30,
            )
        except requests.exceptions.Timeout:
            return jsonify({
                "reply": "Desculpe, o assistente demorou muito para responder."
            }), 504
        except requests.exceptions.RequestException as e:
            print(f"[CHAT] Erro de requisição ao n8n: {e}")
            return jsonify({
                "reply": "Falha ao conectar com o assistente."
            }), 502

        status_code = n8n_response.status_code
        raw_body = n8n_response.text or ""
        print(f"[CHAT] HTTP {status_code} do n8n. Corpo (primeiros 500 chars): {raw_body[:500]}")

        if not n8n_response.ok:
            return jsonify({"reply": "Erro ao falar com o assistente."}), 502

        reply_message = raw_body
        try:
            n8n_json = n8n_response.json()
            if isinstance(n8n_json, dict) and "output" in n8n_json:
                reply_message = n8n_json["output"]
            elif isinstance(n8n_json, dict) and "reply" in n8n_json:
                reply_message = n8n_json["reply"]
            elif isinstance(n8n_json, str):
                reply_message = n8n_json
        except json.JSONDecodeError:
            pass

        return jsonify({"reply": reply_message}), 200

    except Exception as e:
        print(f"[CHAT] Erro inesperado: {e}")
        return jsonify({
            "reply": f"Ocorreu um erro interno: {str(e)}"
        }), 500
