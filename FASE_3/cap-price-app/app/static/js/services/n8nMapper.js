// app/static/js/services/n8nMapper.js

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Percorre recursivamente o objeto e devolve
 * o primeiro nó que tiver um array 'jsons'.
 */
function encontrarBlocoDados(node, depth = 0) {
  if (!node || typeof node !== "object") return null;
  if (depth > 10) return null; // só por segurança

  // Se este nó já tem jsons, é o que queremos
  if (Array.isArray(node.jsons)) {
    return node;
  }

  // Percorre chaves
  for (const key of Object.keys(node)) {
    const child = node[key];

    if (Array.isArray(child)) {
      for (const item of child) {
        const found = encontrarBlocoDados(item, depth + 1);
        if (found) return found;
      }
    } else if (child && typeof child === "object") {
      const found = encontrarBlocoDados(child, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Tenta identificar se um objeto "flat" já parece ser
 * um cenário de precificação (sem jsons/dados).
 */
function pareceCenarioFlat(obj) {
  if (!obj || typeof obj !== "object") return false;
  const chaves = Object.keys(obj);

  // Se não tiver quase nada, descarta
  if (chaves.length < 3) return false;

  // Heurística: se tiver pelo menos uma dessas chaves,
  // tratamos como cenário direto.
  const sinais = [
    "precoFinal",
    "precoNet",
    "cmv",
    "produto",
    "destinoCidade",
    "destinoUF",
    "quantidade",
    // Chaves que o main.py costuma retornar
    "valorTotal",
    "distanciaKm"
  ];
  return sinais.some((k) => k in obj);
}

/**
 * Helper: mapeia um cenário cru do n8n para a estrutura que o front usa.
 */
function mapearCenario(cenario, contextoForm, tipo) {
  const c = cenario || {};

  return {
    tipo, // "melhor" ou "alternativo"

    refinaria: c.refinariaNome || c.refinaria || "Não informada",

    origem: c.origem || contextoForm.origem || "",
    destino: c.destino || contextoForm.destino || "",
    destinoCidade: c.destinoCidade || "",
    destinoUF: c.destinoUF || "",

    quantidade: toNumber(
      c.quantidade !== undefined ? c.quantidade : contextoForm.quantidade,
    ),

    precoNet: toNumber(
      c.precoNet !== undefined ? c.precoNet : contextoForm.precoNet,
    ),
    frete: toNumber(c.frete),
    impostos: toNumber(c.impostos),
    difal: toNumber(c.difal),
    cmv: toNumber(c.cmv),
    margem: toNumber(
      c.margem !== undefined ? c.margem : contextoForm.margem,
    ),
    precoFinal: toNumber(c.precoFinal),

    produto: c.produto || contextoForm.produto || "",

    impactoFretePercentual: toNumber(c.impactoFretePercentual),
    distanciaKm: toNumber(c.distanciaKm),

    laudoTexto: c.laudo || "",
    motivo: c.motivo || "",
    situacaoFiscal: c.situacaoFiscal || "",
    usoSaldoCredor: c.usoSaldoCredor || "",
    justificativaLogistica: c.justificativaLogistica || "",
    principalVantagem: c.principalVantagem || "",
    riscoFiscal: c.riscoFiscal || "",
    
    // Preserva o laudoHtml se vier em cada item
    laudoHtml: c.laudoHtml || null 
  };
}

/**
 * Normaliza a resposta do n8n para o formato esperado pelo front.
 */
export function normalizarResposta(rawResponse, contextoForm = {}) {
  console.log("🧩 normalizarResposta: rawResponse recebido:", rawResponse);

  // 1) Se vier como string JSON, faz o parse
  let data = rawResponse;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
      console.log(
        "🧩 normalizarResposta: payload convertido de string para JSON:",
        data,
      );
    } catch (e) {
      console.error(
        "normalizarResposta: não consegui fazer JSON.parse do payload:",
        e,
      );
      return { opcoes: [], laudoHtml: null };
    }
  }

  // 2) DETECÇÃO INTELIGENTE DE LISTA JÁ MAPEADA (Correção Principal)
  // Se o main.py já mandou uma lista [Option1, Option2, Option3], detectamos aqui
  // antes que a lógica antiga descarte os itens extras.
  if (Array.isArray(data) && data.length > 0) {
    // Verifica se o primeiro item já parece um cenário pronto
    if (pareceCenarioFlat(data[0])) {
      console.log("🧩 normalizarResposta: detectada lista plana vinda do Python. Mapeando todos os itens.");
      
      const opcoes = data.map((item, idx) => 
        mapearCenario(item, contextoForm, idx === 0 ? "melhor" : "alternativo")
      );

      // Tenta recuperar o laudoHtml de algum item, se existir
      const itemComLaudo = data.find(d => d.laudoHtml);
      const laudoHtml = itemComLaudo ? itemComLaudo.laudoHtml : null;

      return { opcoes, laudoHtml };
    }
  }

  // ---------------- LÓGICA ANTIGA (FALLBACK PARA ESTRUTURAS DO N8N) ----------------

  // Se vier array na raiz mas não for plano, usamos o primeiro item como "root" para buscar dados dentro
  let root = data;
  if (Array.isArray(root)) {
    root = root[0] || {};
  }

  // 2.1) Caso clássico de n8n: [{ json: { ...payload... } }]
  if (
    root &&
    typeof root === "object" &&
    root.json &&
    typeof root.json === "object"
  ) {
    root = root.json;
  }

  console.log("🧩 normalizarResposta: root após desembrulhar:", root);

  // ---------- CAMINHO 1: tentar achar dados.jsons/htmls ----------
  let blocoDados =
    (root && (root.dados || root.data || root.result)) || root;

  // 1.1) Se virou array aqui, pega o primeiro e tenta de novo
  if (Array.isArray(blocoDados)) {
    console.log(
      "🧩 normalizarResposta: blocoDados é array, usando primeiro item:",
      blocoDados,
    );
    blocoDados = blocoDados[0] || {};
    if (
      blocoDados &&
      typeof blocoDados === "object" &&
      blocoDados.json &&
      typeof blocoDados.json === "object"
    ) {
      blocoDados = blocoDados.json;
    }
    blocoDados =
      blocoDados.dados || blocoDados.data || blocoDados.result || blocoDados;
  }

  // 1.2) Se ainda não achou jsons, faz busca profunda no objeto inteiro
  if (!blocoDados || !Array.isArray(blocoDados.jsons)) {
    console.warn(
      "🧩 normalizarResposta: heurísticas não acharam jsons, iniciando busca profunda...",
    );
    const encontrado = encontrarBlocoDados(root);
    if (encontrado) {
      console.log(
        "🧩 normalizarResposta: blocoDados encontrado via DFS:",
        encontrado,
      );
      blocoDados = encontrado;
    }
  }

  let jsons = Array.isArray(blocoDados?.jsons) ? blocoDados.jsons : [];
  let htmls = Array.isArray(blocoDados?.htmls) ? blocoDados.htmls : [];

  console.log("🧩 normalizarResposta: jsons encontrados:", jsons);
  console.log("🧩 normalizarResposta: htmls encontrados (size):", htmls.length);

  // ---------- CAMINHO 2 (FALLBACK FINAL): cenário flat único ----------
  if (!jsons.length) {
    console.warn(
      "normalizarResposta: nenhum nó com 'jsons' encontrado. Tentando interpretar como cenário flat...",
    );

    // candidato principal = root ou primeiro item de data/array
    let candidato = root;
    if (Array.isArray(data) && data.length > 0) {
      candidato = data[0];
    }

    // se ainda estiver embrulhado em .json, desembrulha
    if (
      candidato &&
      typeof candidato === "object" &&
      candidato.json &&
      typeof candidato.json === "object"
    ) {
      candidato = candidato.json;
    }

    console.log(
      "🧩 normalizarResposta: candidato para cenário flat:",
      candidato,
    );

    if (!pareceCenarioFlat(candidato)) {
      console.warn(
        "normalizarResposta: candidato NÃO parece cenário flat. Devolvendo vazio.",
      );
      return { opcoes: [], laudoHtml: htmls[0] || null };
    }

    const laudoHtml = htmls[0] || null;
    const opcoes = [mapearCenario(candidato, contextoForm, "melhor")];

    console.log(
      "🧩 normalizarResposta: opcoes finais (fallback flat):",
      opcoes,
    );

    return { opcoes, laudoHtml };
  }

  // ---------- CAMINHO 3: dados.jsons/htmls encontrados via estrutura n8n ----------
  const laudoHtml = htmls[0] || null;

  // NOVO: cada item de `jsons` vira uma opção
  const opcoes = jsons.map((cenario, idx) =>
    mapearCenario(cenario, contextoForm, idx === 0 ? "melhor" : "alternativo"),
  );

  console.log("🧩 normalizarResposta: opcoes finais:", opcoes);

  return { opcoes, laudoHtml };
}