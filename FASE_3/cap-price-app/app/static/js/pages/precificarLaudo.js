// app/static/js/pages/precificarLaudo.js
// Responsável apenas por controlar o Laudo (HTML):
// - estado interno do último laudo
// - habilitar/desabilitar botões
// - visualizar em modal
// - imprimir/baixar em PDF via print

export function initLaudoHandlers({
  btnDownload,
  btnVisualizar,
  modal,
  modalClose,
  iframe,
}) {
  let ultimoLaudoHtml = null;

  // --- Helpers internos ---
  function atualizarBotoes() {
    const hasLaudo = !!ultimoLaudoHtml;
    if (btnDownload) btnDownload.disabled = !hasLaudo;
    if (btnVisualizar) btnVisualizar.disabled = !hasLaudo;
  }

  function fecharModal() {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    if (iframe) iframe.srcdoc = "";
  }

  // --- Ações públicas que o precificar.js vai usar ---
  function setLaudoHtml(html) {
    ultimoLaudoHtml = html || null;
    atualizarBotoes();
  }

  function resetLaudo() {
    ultimoLaudoHtml = null;
    atualizarBotoes();
    fecharModal();
  }

  // --- Eventos dos botões ---
  // Baixar / imprimir laudo
  if (btnDownload) {
    btnDownload.addEventListener("click", () => {
      if (!ultimoLaudoHtml) {
        alert("Nenhum laudo disponível. Execute uma simulação primeiro.");
        return;
      }

      let printIframe = document.getElementById("laudo-print-iframe");
      if (!printIframe) {
        printIframe = document.createElement("iframe");
        printIframe.id = "laudo-print-iframe";
        printIframe.style.position = "fixed";
        printIframe.style.right = "0";
        printIframe.style.bottom = "0";
        printIframe.style.width = "0";
        printIframe.style.height = "0";
        printIframe.style.border = "0";
        printIframe.style.opacity = "0";
        document.body.appendChild(printIframe);
      }

      const iframeWindow = printIframe.contentWindow || printIframe;
      const doc = iframeWindow.document || printIframe.contentDocument;

      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Laudo de Simulação</title>
          <style>
            @page {
              size: A4;
              margin: 15mm;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          ${ultimoLaudoHtml}
        </body>
        </html>
      `);
      doc.close();

      setTimeout(() => {
        try {
          iframeWindow.focus();
          iframeWindow.print();
        } catch (e) {
          console.error("Erro ao chamar impressão do laudo:", e);
          alert("Não foi possível abrir a tela de impressão do laudo.");
        }
      }, 300);
    });
  }

  // Visualizar laudo em modal (iframe)
  if (btnVisualizar && modal && iframe) {
    btnVisualizar.addEventListener("click", () => {
      if (!ultimoLaudoHtml) {
        alert("Nenhum laudo disponível. Execute uma simulação primeiro.");
        return;
      }
      iframe.srcdoc = ultimoLaudoHtml;
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    });
  }

  // Fechar modal
  if (modal && modalClose) {
    modalClose.addEventListener("click", fecharModal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        fecharModal();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.classList.contains("hidden")) {
        fecharModal();
      }
    });
  }

  // estado inicial
  atualizarBotoes();

  // Expõe API simples para o precificar.js
  return {
    setLaudoHtml,
    resetLaudo,
  };
}
