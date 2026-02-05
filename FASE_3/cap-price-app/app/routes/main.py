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
    "https://automacoes-n8n.infrassys.com/webhook-test/CPV5x",
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

    def _unwrap_n8n(obj):
        """Desempacota JSON se estiver dentro de um campo 'output' (comum em IAs/n8n)."""
        import json
        if isinstance(obj, list) and obj:
            obj = obj[0]
        
        if isinstance(obj, dict) and "output" in obj and isinstance(obj["output"], str):
            text = obj["output"].strip()
            # Remove blocos de código markdown se existirem
            if text.startswith("```"):
                lines = text.splitlines()
                if lines[0].startswith("```"): lines = lines[1:]
                if lines and lines[-1].startswith("```"): lines = lines[:-1]
                text = "\n".join(lines).strip()
            try:
                decoded = json.loads(text)
                return decoded
            except:
                pass
        return obj

    # ---------- Normaliza/Desempacota raiz ----------
    n8n_json = _unwrap_n8n(n8n_json)
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

    def _deep_search(obj, key):
        """Busca recursiva por uma chave em um objeto aninhado."""
        if isinstance(obj, dict):
            if key in obj:
                return obj[key]
            for v in obj.values():
                if isinstance(v, (dict, list)):
                    res = _deep_search(v, key)
                    if res is not None:
                        return res
        elif isinstance(obj, list):
            for item in obj:
                res = _deep_search(item, key)
                if res is not None:
                    return res
        return None

    for item in jsons:
        if not isinstance(item, dict):
            continue

        # Helper robusto idêntico ao laudo_precificacao.py
        def _find_val(keys: list | str, default=0.0):
            if isinstance(keys, str):
                keys = [keys]
            
            for k in keys:
                val = item.get(k)
                
                # Se não achou no nível superior, tenta recursivo (se item for complexo)
                # ou se item for o próprio json, tenta na raiz (n8n_json) como fallback?
                # Aqui vamos focar em achar dentro do 'item' ou 'raiz' se item tiver faltando dados
                if val is None or val == "":
                     val = _deep_search(item, k)
                
                # Se ainda não achou, tenta na raiz global (caso de dados flat fora do array)
                if val is None or val == "":
                     val = _deep_search(n8n_json, k)

                if val is not None and val != "":
                    # Tenta converter
                    if isinstance(val, (int, float)):
                        return float(val)
                    if isinstance(val, str):
                        # Limpa R$, espaços, troca vírgula por ponto
                        clean = val.replace("R$", "").replace(" ", "")
                        if "," in clean and "." in clean: # 2.000,00 -> 2000.00
                            clean = clean.replace(".", "").replace(",", ".")
                        elif "," in clean: # 200,00 -> 200.00
                            clean = clean.replace(",", ".")
                        try:
                            return float(clean)
                        except ValueError:
                            pass
            return default

        def _find_str(keys: list | str, default=""):
            if isinstance(keys, str): keys = [keys]
            for k in keys:
                val = item.get(k) or _deep_search(item, k) or _deep_search(n8n_json, k)
                if val:
                    return str(val)
            return default

        # Extração Robusta
        origem = _find_str(["origem", "Origem", "refinariaNome", "refinaria_nome", "refinaria_codigo", "Refinaria"], "Origem não informada")
        destino = _find_str(["destino", "Destino", "destinoCidade", "destino_cidade"], "")
        
        # Quantidade
        quantidade = _find_val(["quantidade", "Quantidade", "Qtd"], 0)

        # Financeiro
        preco_net = _find_val(["precoNet", "preco_net", "valor_net", "valor_net_refinaria", "Preço Net"], 0)
        frete = _find_val(["frete", "vlr_frete_unitario", "valor_frete", "Frete"], 0)
        
        # Impostos e Componentes
        impostos = _find_val(["impostos", "valor_impostos", "Impostos"], 0)
        difal = _find_val(["difal", "valor_difal", "DIFAL"], 0)
        cmv = _find_val(["cmv", "CMV", "preco_com_margem", "custo_venda"], 0)
        margem = _find_val(["margem", "margem_percentual", "Margem", "margemInformada"], 0)
        
        preco_final = _find_val(["precoFinal", "preco_final", "preco_final_unitario", "Preço Final"], 0)

        custo_fixo = _find_val(["custoFixo", "custo_fixo"], 0)

        icms_vlr = _find_val(["vlr_icms", "valor_icms", "icms_valor"], 0)
        pis_vlr = _find_val(["vlr_pis", "valor_pis", "pis_valor"], 0)
        cofins_vlr = _find_val(["vlr_cofins", "valor_cofins", "cofins_valor"], 0)

        # Fallback de impostos (soma)
        if impostos == 0:
            impostos = icms_vlr + pis_vlr + cofins_vlr + difal

        # Recálculo de Preço Final se zerado
        if preco_final == 0:
            preco_sem_impostos = _find_val(["precoSemImpostos", "preco_sem_impostos"], 0)
            if preco_sem_impostos > 0:
                preco_final = preco_sem_impostos + impostos
            elif preco_net > 0:
                 # Tentativa extrema: net + impostos + custo fixo + margem?
                 # Melhor deixar 0 se não tiver dados suficientes para não inventar
                 pass
        
        valor_total = _find_val(["valorTotal", "valor_total", "Valor Total"], 0)
        if valor_total == 0 and preco_final > 0 and quantidade > 0:
            valor_total = preco_final * quantidade

        distancia = _find_val(["distanciaKm", "distancia_km", "Distância"], 0)

        resultado = {
            "origem": origem,
            "destino": destino,
            "quantidade": quantidade,
            "precoNet": preco_net,
            "frete": frete,
            "impostos": impostos,
            "difal": difal,
            "cmv": cmv,
            "margem": margem,
            "precoFinal": preco_final,
            "produto": _find_str(["produto", "Produto"], ""),
            "destinoCidade": _find_str(["destinoCidade", "destino_cidade"], ""),
            "destinoUF": _find_str(["destinoUF", "destino_uf"], ""),
            "refinariaNome":_find_str(["refinariaNome", "refinaria_nome", "Refinaria"], ""),
            "filialRecomendada": item.get("filialRecomendada") or "",
            "distanciaKm": distancia,
            "custoFixo": custo_fixo,
            "valorTotal": valor_total,
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
        print("[SSO CALLBACK] Falha: code ausente na URL.")
        return "SSO inválido: code ausente", 400

    print(f"[SSO CALLBACK] Iniciando troca: code={code[:6]}... para client={SSO_CLIENT_ID}")

    if not CAPSSYS_INTERNAL_BASE_URL:
        print("[SSO CALLBACK] Falha: CAPSSYS_INTERNAL_BASE_URL não configurada.")
        return "SSO inválido: CAPSSYS_INTERNAL_BASE_URL não configurada", 500

    try:
        exchange_url = f"{CAPSSYS_INTERNAL_BASE_URL}/api/sso/exchange"
        print(f"[SSO CALLBACK] POST {exchange_url}")
        r = requests.post(
            exchange_url,
            json={
                "code": code,
                "client_id": SSO_CLIENT_ID,
                "client_secret": SSO_CLIENT_SECRET,
                "state": state,
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


# ============================================================
# API Auxiliares (Proxy)
# ============================================================
@main_bp.route("/api/cidades/<uf>", methods=["GET"])
@login_required
def api_cidades(uf):
    """
    Proxy para buscar cidades.
    Alterado para usar BrasilAPI (mais estável e sem bloqueios WAF chatos do IBGE).
    """
    # Validação simples
    if not uf:
        return jsonify({"error": "UF vazia"}), 400
    
    # Limpeza (apenas 2 chars)
    uf_clean = uf.strip().upper()[:2]
    
    try:
        # Usando BrasilAPI (wrapper mais amigável)
        url = f"https://brasilapi.com.br/api/ibge/municipios/v1/{uf_clean}"
        
        # BrasilAPI geralmente é rápido e não bloqueia requests simples
        resp = requests.get(url, timeout=10)
        
        if not resp.ok:
            print(f"[API CIDADES] Erro BrasilAPI: {resp.status_code}")
            return jsonify([]), resp.status_code
        
        data = resp.json()
        # O formato é compatível: lista de dicts com chave "nome"
        return jsonify(data)

    except Exception as e:
        print(f"[API CIDADES] Exceção ao buscar cidades: {e}")
        return jsonify({"error": str(e)}), 500
