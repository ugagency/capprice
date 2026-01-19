from datetime import datetime
from typing import Any, Dict, List, Tuple, Optional

from flask import render_template


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


def _montar_contexto_laudo(
    cenario: Dict,
    cenarios_alternativos: List[Dict],
    raiz: Any,
) -> Dict[str, Any]:
    """Monta o dicionário de contexto usado pelo template Jinja do laudo."""

    # Campos básicos (cenário principal)
    laudo_texto = cenario.get("laudo") or ""
    motivo = cenario.get("motivo") or ""

    quantidade = (
        cenario.get("quantidade")
        or (raiz.get("quantidade") if isinstance(raiz, dict) else 0)
        or 0
    )

    preco_final = cenario.get("precoFinal") or 0
    preco_net = cenario.get("precoNet") or 0
    frete = cenario.get("frete") or 0
    impostos = cenario.get("impostos") or 0
    valor_total = cenario.get("valorTotal") or 0

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
    icms_vlr = cenario.get("vlr_icms")
    pis_aliq = cenario.get("pis")
    pis_vlr = cenario.get("vlr_pis")
    cofins_aliq = cenario.get("cofins")
    cofins_vlr = cenario.get("vlr_cofins")

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

    # NOVO: lista detalhada de cenários alternativos (Opção 2, 3, ...)
    alternativos_detalhados: List[Dict[str, Any]] = []
    for idx, alt in enumerate(cenarios_alternativos, start=2):
        alt_quantidade = (
            alt.get("quantidade")
            or (raiz.get("quantidade") if isinstance(raiz, dict) else 0)
            or 0
        )
        alt_preco_final = alt.get("precoFinal") or 0
        alt_preco_net = alt.get("precoNet") or 0
        alt_frete = alt.get("frete") or 0
        alt_impostos = alt.get("impostos") or 0
        alt_valor_total = alt.get("valorTotal") or 0

        alt_origem_str = alt.get("origem") or ""
        alt_destino_str = alt.get("destino") or ""

        alt_origem_cidade_fallback = alt.get("origemCidade") or origem_cidade
        alt_origem_uf_fallback = alt.get("origemUF") or origem_uf
        alt_destino_cidade_fallback = alt.get("destinoCidade") or destino_cidade
        alt_destino_uf_fallback = alt.get("destinoUF") or destino_uf

        alt_origem_cidade, alt_origem_uf = _split_cidade_uf(
            alt_origem_str, alt_origem_cidade_fallback, alt_origem_uf_fallback
        )
        alt_destino_cidade, alt_destino_uf = _split_cidade_uf(
            alt_destino_str, alt_destino_cidade_fallback, alt_destino_uf_fallback
        )

        alt_produto = alt.get("produto") or produto
        alt_refinaria = (
            alt.get("refinariaNome")
            or alt.get("refinaria")
            or ""
        )
        alt_impacto_frete = alt.get("impactoFretePercentual")
        alt_distancia_km_val = alt.get("distanciaKm") or 0
        alt_situacao_fiscal = alt.get("situacaoFiscal") or situacao_fiscal
        alt_risco_fiscal = alt.get("riscoFiscal") or risco_fiscal
        alt_uso_saldo = alt.get("usoSaldoCredor") or uso_saldo

        alternativos_detalhados.append(
            {
                "opcao_label": f"Opção {idx}",
                "laudo_texto": alt.get("laudo") or laudo_texto,
                "motivo": alt.get("motivo") or motivo,
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
                "produto": alt_produto,
                "refinaria": alt_refinaria,
                "impacto_frete": _fmt_percent(alt_impacto_frete),
                "distancia_km": _fmt_km(alt_distancia_km_val),
                "situacao_fiscal": alt_situacao_fiscal,
                "risco_fiscal": alt_risco_fiscal,
                "uso_saldo": alt_uso_saldo,
            }
        )

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

    return {
        # Cabeçalho
        "laudo_texto": laudo_texto,
        "motivo": motivo,
        "quantidade": quantidade,

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

        # NOVO: detalhes completos das opções alternativas
        "alternativos_detalhados": alternativos_detalhados,

        # Rodapé
        "data_referencia": datetime.now().strftime("%d/%m/%Y"),
    }


def gerar_laudo_para_resposta_simulacao(n8n_json: Any) -> Any:
    """
    Recebe o JSON bruto do n8n, gera o HTML do laudo e injeta em `htmls`.

    Mantém a estrutura original do JSON, apenas adicionando/atualizando o campo
    `htmls` no mesmo nível em que estiverem os `jsons`/`cenarios`.
    """
    try:
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
    except Exception:
        # Qualquer erro aqui não pode quebrar a simulação inteira:
        # devolve o JSON original sem mexer.
        return n8n_json
