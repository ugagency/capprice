// app/static/js/services/n8nLaudoMapper.js
// Mapper exclusivo para extrair o HTML do laudo da resposta do backend/n8n.

function tentarParseJson(valor) {
  if (typeof valor === "string") {
    try {
      return JSON.parse(valor);
    } catch {
      return valor;
    }
  }
  return valor;
}

/**
 * Busca, em profundidade, qualquer nó que possua um array "htmls".
 * (caminho antigo, usado quando o n8n devolve htmls[])
 */
function buscarHtmlsProfundo(node, depth = 0) {
  if (node == null) return null;
  if (depth > 15) return null; // só por segurança pra evitar ciclos muito profundos

  // Se for um array na raiz, percorre cada item
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = buscarHtmlsProfundo(item, depth + 1);
      if (found && found.length) return found;
    }
    return null;
  }

  if (typeof node !== "object") return null;

  // Se ESTE nó já tem htmls, é o que queremos
  if (Array.isArray(node.htmls) && node.htmls.length) {
    return node.htmls;
  }

  // Percorre os filhos (valores das chaves)
  for (const valor of Object.values(node)) {
    if (valor && typeof valor === "object") {
      const found = buscarHtmlsProfundo(valor, depth + 1);
      if (found && found.length) return found;
    }
  }

  return null;
}

export function extrairLaudoHtml(rawResponse) {
  console.log("🧩 extrairLaudoHtml: rawResponse recebido:", rawResponse);

  // 1) Garante que temos um objeto/array JS
  const data = tentarParseJson(rawResponse);
  console.log("🧩 extrairLaudoHtml: data após parse:", data);

  // 2) NOVO: caso o Flask já tenha mapeado e enviado laudoHtml direto
  //    Ex.: [ { ..., laudoHtml: "<html>...</html>" }, ... ]
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (
      first &&
      typeof first === "object" &&
      typeof first.laudoHtml === "string" &&
      first.laudoHtml.trim()
    ) {
      console.log(
        "📄 extrairLaudoHtml: encontrado laudoHtml direto no primeiro cenário."
      );
      return first.laudoHtml;
    }
  }

  // Também cobre o caso de vir como objeto único { ..., laudoHtml: "..." }
  if (
    data &&
    !Array.isArray(data) &&
    typeof data === "object" &&
    typeof data.laudoHtml === "string" &&
    data.laudoHtml.trim()
  ) {
    console.log(
      "📄 extrairLaudoHtml: encontrado laudoHtml direto no objeto raiz."
    );
    return data.laudoHtml;
  }

  // 3) Caminho antigo: procurar htmls[] em qualquer lugar da estrutura
  const htmls = buscarHtmlsProfundo(data);
  const laudoHtml = htmls && htmls.length ? String(htmls[0]) : null;

  console.log(
    "📄 extrairLaudoHtml: encontrou laudoHtml via htmls[]?",
    !!laudoHtml
  );

  return laudoHtml;
}
