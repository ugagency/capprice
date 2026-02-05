from datetime import datetime
import traceback
from typing import Any, Dict, List, Tuple, Optional

from flask import render_template, render_template_string


def _fmt_moeda(valor: Any) -> str:
    """Formata número como moeda brasileira."""
    try:
        v = float(valor or 0)
    except (TypeError, ValueError):
        v = 0.0
    return (
        f"R$ {v:,.2f}"
        .replace(",", "X")
        .replace(".", ",")
        .replace("X", ".")
    )


def _fmt_percent(valor: Any) -> str:
    """Formata número como porcentagem."""
    try:
        v = float(valor or 0)
    except (TypeError, ValueError):
        v = 0.0
    return (
        f"{v:,.2f}%"
        .replace(",", "X")
        .replace(".", ",")
        .replace("X", ".")
    )


def _fmt_km(valor: Any) -> str:
    """Formata número como km."""
    try:
        v = float(valor or 0)
    except (TypeError, ValueError):
        v = 0.0
    return (
        f"{v:,.2f} km"
        .replace(",", "X")
        .replace(".", ",")
        .replace("X", ".")
    )


def _find_first_list(obj: Any, key: str) -> Tuple[Optional[List], Optional[Dict]]:
    """
    Procura recursivamente a primeira lista com a chave `key`.

    Retorna (lista_encontrada, dict_que_contem_essa_lista).
    """
    if isinstance(obj, dict):
        if key in obj and isinstance(obj[key], list):
            return obj[key], obj
        for v in obj.values():
            lista, dono = _find_first_list(v, key)
            if lista is not None:
                return lista, dono
    elif isinstance(obj, list):
        for item in obj:
            lista, dono = _find_first_list(item, key)
            if lista is not None:
                return lista, dono
    return None, None


def _extrair_cenario_principal(
    n8n_json: Any,
) -> Tuple[Optional[Dict], List[Dict], Optional[Dict], Any]:
    """
    Extrai o cenário principal e os alternativos do JSON vindo do n8n.

    Compatível com dois formatos:

    1) Antigo: um objeto com `dados.jsons[0]` como principal e
       `dados.jsons[0].cenariosAlternativos` como alternativas.

    2) Novo: a lista `dados.jsons` já vem com as N melhores opções,
       onde o primeiro item é o vencedor e os demais são alternativas.
    """
    raiz = n8n_json
    if isinstance(raiz, list) and raiz and isinstance(raiz[0], dict):
        raiz = raiz[0]

    # tenta achar primeiro em dados.jsons, depois em 'cenarios'
    jsons, owner = _find_first_list(raiz, "jsons")
    if not jsons:
        jsons, owner = _find_first_list(raiz, "cenarios")

    # fallback: se a raiz já for uma lista de cenários
    if not jsons:
        if isinstance(raiz, list):
            jsons = [it for it in raiz if isinstance(it, dict)]
        elif isinstance(raiz, dict):
            jsons = [raiz]

    if not jsons:
        return None, [], None, raiz

    principal = jsons[0] if isinstance(jsons[0], dict) else None
    if principal is None:
        return None, [], owner, raiz

    # ----- monta lista de alternativos -----
    alternativos: List[Dict] = []

    # 1) Se o principal já tiver 'cenariosAlternativos', usa esse campo
    embutidos = principal.get("cenariosAlternativos")
    if isinstance(embutidos, list) and embutidos:
        alternativos = [alt for alt in embutidos if isinstance(alt, dict)]
    else:
        # 2) Caso novo: usamos as demais posições de jsons como alternativas
        for alt in jsons[1:]:
            if isinstance(alt, dict):
                alternativos.append(alt)

    return principal, alternativos, owner, raiz


def _split_cidade_uf(
    cidade_uf: Any,
    cidade_fallback: str = "",
    uf_fallback: str = "",
) -> Tuple[str, str]:
    if isinstance(cidade_uf, str) and cidade_uf:
        if "/" in cidade_uf:
            cidade, uf = cidade_uf.split("/", 1)
            return cidade.strip(), uf.strip()
        return cidade_uf.strip(), uf_fallback
    return cidade_fallback, uf_fallback





def _deep_search(obj: Any, key: str) -> Any:
    """Busca recursiva por uma chave em um objeto aninhado (dict/list)."""
    if isinstance(obj, dict):
        if key in obj and obj[key] is not None:
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


def _montar_contexto_laudo(
    cenario: Dict,
    cenarios_alternativos: List[Dict],
    raiz: Any,
) -> Dict[str, Any]:
    """Monta o dicionário de contexto usado pelo template Jinja do laudo."""

    # Campos básicos (cenário principal)
    # Tenta achar no cenario, ou no objeto 'dados' da raiz (conforme relato do usuário)
    dados_raiz = raiz.get("dados", {}) if isinstance(raiz, dict) else {}
    
    def _extract_text(obj, keys):
        for k in keys:
            val = obj.get(k)
            if not val:
                continue
            if isinstance(val, str):
                return val
            if isinstance(val, list):
                return "\n".join(str(v) for v in val)
            if isinstance(val, dict):
                # Tenta campos comuns de texto dentro do dicionário
                return val.get("texto") or val.get("resumo") or val.get("descricao") or str(val)
        return None

    # Prioridade de campos para o parecer/diagnóstico
    text_keys = ["diagnostico", "laudo", "texto", "parecer", "motivo"]
    
    laudo_texto = _extract_text(cenario, text_keys)
    if not laudo_texto:
        laudo_texto = _extract_text(dados_raiz, text_keys)
    if not laudo_texto:
        laudo_texto = _extract_text(raiz, text_keys)
    
    laudo_texto = laudo_texto or ""
    
    motivo = (
        cenario.get("motivo")
        or dados_raiz.get("motivo")
        or ""
    )

    quantidade = (
        cenario.get("quantidade")
        or (raiz.get("quantidade") if isinstance(raiz, dict) else 0)
        or _deep_search(raiz, "quantidade")
        or 0
    )

    # Helper para buscar valor numérico em cenario ou raiz (recursivo)
    def _get_val(keys: Any, default=0):
        if isinstance(keys, str):
            keys = [keys]
        for key in keys:
            val = cenario.get(key)
            if val is None or val == 0 or val == "":
                val = _deep_search(raiz, key)
            if val is not None and val != 0 and val != "":
                return val
        return default

    # Preços e Impostos (com fallback deep search e snake_case)
    preco_net = _get_val(["precoNet", "preco_net", "valor_net", "valor_net_refinaria"])
    frete = _get_val(["frete", "vlr_frete_unitario", "valor_frete"])
    impostos = _get_val(["impostos", "valor_impostos"])
    difal = _get_val(["difal", "valor_difal"])
    icms_vlr = _get_val(["vlr_icms", "valor_icms", "icms_valor"])
    pis_vlr = _get_val(["vlr_pis", "valor_pis", "pis_valor"])
    cofins_vlr = _get_val(["vlr_cofins", "valor_cofins", "cofins_valor"])

    # Se 'impostos' vier zerado, soma os componentes individuais
    if not impostos:
        impostos = icms_vlr + pis_vlr + cofins_vlr + difal

    preco_final = _get_val(["precoFinal", "preco_final"])
    # Se 'precoFinal' vier zerado, tenta montar pelo precoSemImpostos + impostos
    if not preco_final:
        preco_sem_impostos = _get_val(["precoSemImpostos", "preco_sem_impostos"])
        if preco_sem_impostos:
            preco_final = preco_sem_impostos + impostos

    valor_total = _get_val(["valorTotal", "valor_total"])
    if not valor_total and preco_final:
        valor_total = preco_final * quantidade

    # Origem / destino
    origem_str = cenario.get("origem") or ""
    destino_str = cenario.get("destino") or ""

    origem_cidade_fallback = cenario.get("origemCidade") or ""
    origem_uf_fallback = cenario.get("origemUF") or ""
    destino_cidade_fallback = cenario.get("destinoCidade") or ""
    destino_uf_fallback = cenario.get("destinoUF") or ""

    origem_cidade, origem_uf = _split_cidade_uf(
        origem_str, origem_cidade_fallback, origem_uf_fallback
    )
    destino_cidade, destino_uf = _split_cidade_uf(
        destino_str, destino_cidade_fallback, destino_uf_fallback
    )

    produto = cenario.get("produto") or ""
    refinaria = (
        cenario.get("refinariaNome")
        or cenario.get("refinaria")
        or ""
    )

    impacto_frete = cenario.get("impactoFretePercentual")
    situacao_fiscal = cenario.get("situacaoFiscal") or ""
    risco_fiscal = cenario.get("riscoFiscal") or ""
    uso_saldo = cenario.get("usoSaldoCredor") or ""
    distancia_km_val = cenario.get("distanciaKm") or 0

    # Alíquotas
    icms_aliq = cenario.get("icms")
    # icms_vlr já obtido acima
    pis_aliq = cenario.get("pis")
    # pis_vlr já obtido acima
    cofins_aliq = cenario.get("cofins")
    # cofins_vlr já obtido acima

    # Alternativos formatados para a tabela simples
    alternativos_fmt: List[Dict[str, str]] = []
    for alt in cenarios_alternativos:
        refinaria_alt = (
            alt.get("refinaria")
            or alt.get("refinariaNome")
            or alt.get("refinaria_nome")
            or ""
        )
        alternativos_fmt.append(
            {
                "refinaria": refinaria_alt,
                "distancia_km": _fmt_km(alt.get("distanciaKm", 0)),
                "frete": _fmt_moeda(alt.get("frete", 0)),
                "preco_final": _fmt_moeda(alt.get("precoFinal", 0)),
            }
        )

    # Detecta se deve exibir a tabela interativa (DESATIVADO por solicitação do usuário)
    exibir_tabela_v = False

    # Alíquotas
    aliquotas: List[Dict[str, str]] = []
    if icms_aliq is not None:
        aliquotas.append(
            {
                "label": "ICMS",
                "aliquota": _fmt_percent(icms_aliq),
                "valor": _fmt_moeda(icms_vlr),
            }
        )
    if pis_aliq is not None:
        aliquotas.append(
            {
                "label": "PIS",
                "aliquota": _fmt_percent(pis_aliq),
                "valor": _fmt_moeda(pis_vlr),
            }
        )
    if cofins_aliq is not None:
        aliquotas.append(
            {
                "label": "COFINS",
                "aliquota": _fmt_percent(cofins_aliq),
                "valor": _fmt_moeda(cofins_vlr),
            }
        )

    # NOVO: Detalhes das 3 melhores alternativas (caso NÃO seja TabelaV)
    alternativos_detalhados: List[Dict[str, Any]] = []
    # Pegamos até 3 cenários alternativos
    for idx, alt in enumerate(cenarios_alternativos[:3], start=2):
        alt_quantidade = alt.get("quantidade") or quantidade
        alt_preco_final = alt.get("precoFinal") or 0
        alt_preco_net = alt.get("precoNet") or 0
        alt_frete = alt.get("frete") or 0
        alt_impostos = alt.get("impostos") or 0
        alt_valor_total = alt.get("valorTotal") or 0

        alt_origem_str = alt.get("origem") or ""
        alt_destino_str = alt.get("destino") or ""
        alt_origem_cidade, alt_origem_uf = _split_cidade_uf(alt_origem_str)
        alt_destino_cidade, alt_destino_uf = _split_cidade_uf(alt_destino_str)

        alternativos_detalhados.append({
            "opcao_label": f"Opção {idx}",
            "laudo_texto": _extract_text(alt, text_keys) or "",
            "motivo": alt.get("motivo") or "",
            "quantidade": alt_quantidade,
            "preco_final": _fmt_moeda(alt_preco_final),
            "preco_net": _fmt_moeda(alt_preco_net),
            "frete": _fmt_moeda(alt_frete),
            "impostos": _fmt_moeda(alt_impostos),
            "valor_total": _fmt_moeda(alt_valor_total),
            "origem_cidade": alt_origem_cidade,
            "origem_uf": alt_origem_uf,
            "destino_cidade": alt_destino_cidade,
            "destino_uf": alt_destino_uf,
            "produto": alt.get("produto") or produto,
            "refinaria": alt.get("refinariaNome") or alt.get("refinaria") or "",
            "impacto_frete": _fmt_percent(alt.get("impactoFretePercentual")),
            "distancia_km": _fmt_km(alt.get("distanciaKm", 0)),
            "situacao_fiscal": alt.get("situacaoFiscal") or situacao_fiscal,
            "risco_fiscal": alt.get("riscoFiscal") or risco_fiscal,
            "uso_saldo": alt.get("usoSaldoCredor") or uso_saldo,
        })

    # NOVO: Diagnóstico Textual (Relatório derivado da planilha) e Status
    # O usuário informou que agora vem um texto chamado 'diagnostico' e um texto 'status'.
    
    # Extração de Status
    status_simulacao = cenario.get("status") or raiz.get("status") or "Concluído"

    # Extração de Diagnóstico (Prioriza texto simples conforme solicitado)
    # Se laudo_texto já é o diagnóstico, usamos ele para evitar redundância
    diagnostico_texto = laudo_texto if (cenario.get("diagnostico") or not laudo_texto) else (cenario.get("diagnostico") or laudo_texto)
    
    # Mantemos o objeto diagnostico para compatibilidade se necessário
    diagnostico = {"resumo": diagnostico_texto}
    if not diagnostico.get("resumo") and not any(diagnostico.values()):
        # Se tudo falhou, tenta usar campos soltos
        diagnostico["resumo"] = raiz.get("status_execucao") or ""

    return {
        # Cabeçalho
        "laudo_texto": laudo_texto,
        "motivo": motivo,
        "quantidade": quantidade,
        "exibir_tabela_v": exibir_tabela_v,
        "diagnostico": diagnostico,  # <--- Injected diagnostic object

        # Resumo financeiro (opção vencedora)
        "preco_final": _fmt_moeda(preco_final),
        "preco_net": _fmt_moeda(preco_net),
        "frete": _fmt_moeda(frete),
        "impostos": _fmt_moeda(impostos),
        "valor_total": _fmt_moeda(valor_total),

        # Dados logísticos (opção vencedora)
        "origem_cidade": origem_cidade,
        "origem_uf": origem_uf,
        "destino_cidade": destino_cidade,
        "destino_uf": destino_uf,
        "produto": produto,
        "refinaria": refinaria,
        "impacto_frete": _fmt_percent(impacto_frete),
        "distancia_km": _fmt_km(distancia_km_val),

        # Inteligência fiscal (opção vencedora)
        "situacao_fiscal": situacao_fiscal,
        "risco_fiscal": risco_fiscal,
        "uso_saldo": uso_saldo,
        "aliquotas": aliquotas,

        # Comparativo de cenários (linha simples)
        "alternativos": alternativos_fmt,

        # NOVO: Detalhamento dos top 3 (se não for TabelaV)
        "alternativos_detalhados": alternativos_detalhados,
        
        # Novos campos solicitados
        "diagnostico_texto": diagnostico_texto,
        "status_simulacao": status_simulacao,

        # Dados brutos para o motor JS (sem formatação)
        "raw": {
            "valor_net_refinaria": preco_net,
            "quantidade": quantidade,
            "aliq_pis_cofins_entrada": 9.25,
            "aliq_icms_entrada": icms_aliq if icms_aliq is not None else 12.00,
            "vlr_frete_unitario": frete,
            "aliq_icms_saida": icms_aliq if icms_aliq is not None else 12.00,
            "aliq_pis_saida": 1.65,
            "aliq_cofins_saida": 7.60,
        },

        # Rodapé
        "data_referencia": datetime.now().strftime("%d/%m/%Y"),
    }


def gerar_laudo_para_resposta_simulacao(n8n_json: Any) -> Any:
    """
    Gerador de laudo.
    """
    try:
        # Desempacota se vier dentro de 'output' (Common in LLM/n8n responses)
        import json
        if isinstance(n8n_json, list) and n8n_json:
            n8n_json = n8n_json[0]
        
        if isinstance(n8n_json, dict) and "output" in n8n_json and isinstance(n8n_json["output"], str):
            text = n8n_json["output"].strip()
            if text.startswith("```"):
                lines = text.splitlines()
                if lines[0].startswith("```"): lines = lines[1:]
                if lines and lines[-1].startswith("```"): lines = lines[:-1]
                text = "\n".join(lines).strip()
            try:
                decoded = json.loads(text)
                n8n_json = decoded
            except:
                pass

        principal, alternativos, owner, raiz = _extrair_cenario_principal(n8n_json)
        if principal is None:
            # Nada para fazer, devolve como veio
            return n8n_json

        contexto = _montar_contexto_laudo(principal, alternativos, raiz)
        laudo_html = render_template("laudo_precificacao.html", **contexto)

        # Define onde guardar o HTML gerado
        if owner is not None and isinstance(owner, dict):
            owner["htmls"] = [laudo_html]
        elif isinstance(raiz, dict):
            raiz["htmls"] = [laudo_html]

        return n8n_json
    except Exception as e:
        print("❌ ERRO NA GERAÇÃO DO LAUDO:")
        traceback.print_exc()
        return n8n_json
