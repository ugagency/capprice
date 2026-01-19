// app/static/js/pages/precificar.js

import {
  fetchSimulacao,
  formatCurrency,
  formatPercent,
} from "../services/simulationService.js";
import { normalizarResposta } from "../services/n8nMapper.js";
import { extrairLaudoHtml } from "../services/n8nLaudoMapper.js";
import { initLaudoHandlers } from "./precificarLaudo.js";

export function init() {
  // --- Seletores de Elementos ---
  const simulacaoForm = document.getElementById("simulacao-form");
  const btnSimular = document.getElementById("btn-simular");
  const destinoUfSelect = document.getElementById("destino_uf");
  const destinoCidadeInput = document.getElementById("destino_cidade");
  const cidadesDatalist = document.getElementById("cidades-list");
  const precoNetInput = document.getElementById("preco_net");
  const refinariaSelect = document.getElementById("refinaria");

  const resultadoSection = document.getElementById("resultado-section");
  const loadingSection = document.getElementById("loading-section");
  const btnVoltar = document.getElementById("btn-voltar");

  const tabsHeader = document.getElementById("tabs-header");
  const tabButtons = tabsHeader
    ? tabsHeader.querySelectorAll(".tab-button")
    : [];

  const btnDownloadLaudoCol3 = document.getElementById(
    "btn-download-laudo-col3",
  );
  const btnVisualizarLaudoCol3 = document.getElementById(
    "btn-visualizar-laudo-col3",
  );
  const btnEmailLaudoCol3 = document.getElementById("btn-email-laudo-col3");
  const emailParaEnvio = document.getElementById("email-para-envio");
  const envioEmailContainer = document.getElementById("envio-email-container");

  const graficoDescricao = document.getElementById("grafico-descricao");
  const graficosTabContainer = document.getElementById(
    "graficos-tab-container",
  );
  const graficoTabPreco = document.getElementById("grafico-tab-preco");
  const graficoTabFrete = document.getElementById("grafico-tab-frete");
  const graficoTabMargem = document.getElementById("grafico-tab-margem");
  const graficoContentPreco = document.getElementById("grafico-content-preco");
  const graficoContentFrete = document.getElementById("grafico-content-frete");
  const graficoContentMargem = document.getElementById(
    "grafico-content-margem",
  );

  const chatWindow = document.getElementById("chat-window");
  const chatInput = document.getElementById("chat-input");
  const chatSend = document.getElementById("chat-send");
  const chatSendSim = document.getElementById("chat-send-sim");
  const aiTyping = document.getElementById("ai-typing");
  const btnLogout = document.getElementById("btn-logout");

  const modalLaudoHtml = document.getElementById("modal-laudo-html");
  const modalLaudoClose = document.getElementById("modal-laudo-close");
  const laudoIframe = document.getElementById("laudo-iframe");

  // --- Estado ---
  let currentSimulationResults = [];
  let graficoPreco = null;
  let graficoFrete = null;
  let graficoMargem = null;

  const chatSessionId = "cap_price_web_" + Date.now();

  const toNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // --- Laudo (novo módulo) ---
  const laudoHandlers = initLaudoHandlers({
    btnDownload: btnDownloadLaudoCol3,
    btnVisualizar: btnVisualizarLaudoCol3,
    modal: modalLaudoHtml,
    modalClose: modalLaudoClose,
    iframe: laudoIframe,
  });

  // =========================
  //   RESULTADOS / CARDS
  // =========================
  function displayResultadosCombinados(data) {
    if (!data) return;
    const setId = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setId(
      "laudo-simulacao-id",
      `#S${Math.floor(1000 + Math.random() * 9000)}`,
    );
    // Exibir o nome da refinaria no campo de origem
    setId(
      "laudo-origem",
      data.refinaria || data.refinariaNome || data.origem || "Não informado",
    );
    setId(
      "laudo-destino",
      data.destino || data.destinoCidade || "Não informado",
    );
    setId("laudo-qtd", data.quantidade ?? "");
    setId("laudo-preco-net", formatCurrency(data.precoNet || 0));
    setId("laudo-frete", formatCurrency(data.frete || 0));
    setId("laudo-impostos", formatCurrency(data.impostos || 0));
    setId("laudo-difal", formatCurrency(data.difal || 0));
    setId("laudo-cmv", formatCurrency(data.cmv || 0));
    setId("laudo-margem", formatPercent(data.margem || 0));
    setId("laudo-preco-final", formatCurrency(data.precoFinal || 0));
  }

  // =========================
  //         GRÁFICOS
  // =========================
  function destruirGraficos() {
    if (graficoPreco) {
      graficoPreco.destroy();
      graficoPreco = null;
    }
    if (graficoFrete) {
      graficoFrete.destroy();
      graficoFrete = null;
    }
    if (graficoMargem) {
      graficoMargem.destroy();
      graficoMargem = null;
    }
  }

  function desenharGraficoPreco(data) {
    const canvas = document.getElementById("grafico-preco");
    if (!canvas || !window.Chart) return;
    const ctx = canvas.getContext("2d");

    const labels = data.map((d, i) => `Opção ${i + 1}`);
    const precosFinais = data.map((d) => toNumber(d.precoFinal).toFixed(2));

    graficoPreco = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Preço Final (R$)",
            data: precosFinais,
            backgroundColor: ["#0d9488", "#9ca3af", "#9ca3af"],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => formatCurrency(ctx.parsed.y),
              title: (ctx) => `Opção ${ctx[0].dataIndex + 1}`,
            },
          },
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => formatCurrency(value),
              maxTicksLimit: 4,
            },
          },
        },
      },
    });
  }

  function desenharGraficoFrete(data) {
    const canvas = document.getElementById("grafico-frete");
    if (!canvas || !window.Chart) return;
    const ctx = canvas.getContext("2d");

    const labels = data.map((d, i) => `Opção ${i + 1}`);
    const fretes = data.map((d) => toNumber(d.frete).toFixed(2));

    graficoFrete = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Frete (R$)", data: fretes, backgroundColor: "#6366f1" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => formatCurrency(ctx.parsed.y),
              title: (ctx) => `Opção ${ctx[0].dataIndex + 1}`,
            },
          },
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => formatCurrency(value),
              maxTicksLimit: 4,
            },
          },
        },
      },
    });
  }

  function desenharGraficoMargem(data) {
    const canvas = document.getElementById("grafico-margem");
    if (!canvas || !window.Chart) return;
    const ctx = canvas.getContext("2d");

    const labels = data.map((d, i) => `Opção ${i + 1}`);
    const margens = data.map((d) => toNumber(d.margem).toFixed(2));

    graficoMargem = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Margem (%)", data: margens, backgroundColor: "#f59e0b" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => formatPercent(ctx.parsed.y),
              title: (ctx) => `Opção ${ctx[0].dataIndex + 1}`,
            },
          },
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => formatPercent(value),
              maxTicksLimit: 4,
            },
          },
        },
      },
    });
  }

  // =========================
  //      ESTADO DE TELA
  // =========================
  function showLoading() {
    if (!simulacaoForm) return;
    simulacaoForm.classList.add("hidden");
    resultadoSection.classList.add("hidden");
    loadingSection.classList.remove("hidden");

    if (btnDownloadLaudoCol3) btnDownloadLaudoCol3.disabled = true;
    if (btnEmailLaudoCol3) btnEmailLaudoCol3.disabled = true;
    if (envioEmailContainer) envioEmailContainer.classList.add("hidden");
    if (graficoDescricao) graficoDescricao.classList.add("hidden");
    if (graficosTabContainer) graficosTabContainer.classList.add("hidden");
    if (chatSendSim) chatSendSim.disabled = true;

    laudoHandlers.resetLaudo();
    destruirGraficos();
  }

  function showResults(opcoes) {
    if (!simulacaoForm || !opcoes || opcoes.length === 0) return;
    currentSimulationResults = opcoes;

    destruirGraficos();

    // Se temos mais de uma opção, mostramos as abas e gráficos
    if (opcoes.length > 1) {
      if (tabsHeader && tabsHeader.parentElement) {
        tabsHeader.parentElement.classList.remove("hidden");
      }

      // Ajusta visibilidade das abas (se vierem só 2 opções, esconde a 3ª)
      tabButtons.forEach((btn, idx) => {
        if (opcoes[idx]) {
          btn.style.display = "inline-block";
          if (idx === 0) btn.classList.add("active");
          else btn.classList.remove("active");
        } else {
          btn.style.display = "none";
          btn.classList.remove("active");
        }
      });

      if (graficoDescricao) graficoDescricao.classList.remove("hidden");
      if (graficosTabContainer)
        graficosTabContainer.classList.remove("hidden");

      desenharGraficoPreco(opcoes);
      desenharGraficoFrete(opcoes);
      desenharGraficoMargem(opcoes);

      if (graficoTabPreco) graficoTabPreco.classList.add("active");
      if (graficoTabFrete) graficoTabFrete.classList.remove("active");
      if (graficoTabMargem) graficoTabMargem.classList.remove("active");

      if (graficoContentPreco)
        graficoContentPreco.classList.remove("hidden");
      if (graficoContentFrete)
        graficoContentFrete.classList.add("hidden");
      if (graficoContentMargem)
        graficoContentMargem.classList.add("hidden");
    } else {
      // Apenas 1 opção: esconde abas e gráficos
      if (tabsHeader && tabsHeader.parentElement) {
        tabsHeader.parentElement.classList.add("hidden");
      }
      if (graficoDescricao) graficoDescricao.classList.add("hidden");
      if (graficosTabContainer)
        graficosTabContainer.classList.add("hidden");
    }

    // Exibe a primeira opção por padrão
    displayResultadosCombinados(opcoes[0]);

    simulacaoForm.classList.add("hidden");
    loadingSection.classList.add("hidden");
    resultadoSection.classList.remove("hidden");

    if (btnEmailLaudoCol3) btnEmailLaudoCol3.disabled = false;
    if (envioEmailContainer) envioEmailContainer.classList.remove("hidden");
    if (chatSendSim) chatSendSim.disabled = false; // habilita botão de enviar simulação
  }

  function showProfile() {
    if (!simulacaoForm) return;
    resultadoSection.classList.add("hidden");
    loadingSection.classList.add("hidden");
    simulacaoForm.classList.remove("hidden");
    simulacaoForm.reset();

    if (destinoCidadeInput) {
      destinoCidadeInput.disabled = true;
      destinoCidadeInput.placeholder = "Selecione a UF primeiro";
      destinoCidadeInput.value = "";
    }
    if (cidadesDatalist) {
      cidadesDatalist.innerHTML = "";
    }

    currentSimulationResults = [];
    if (tabsHeader && tabsHeader.parentElement) {
      tabsHeader.parentElement.classList.add("hidden");
    }

    if (btnDownloadLaudoCol3) btnDownloadLaudoCol3.disabled = true;
    if (btnEmailLaudoCol3) btnEmailLaudoCol3.disabled = true;
    if (envioEmailContainer) envioEmailContainer.classList.add("hidden");
    if (graficoDescricao) graficoDescricao.classList.add("hidden");
    if (graficosTabContainer)
      graficosTabContainer.classList.add("hidden");
    if (emailParaEnvio) emailParaEnvio.value = "";
    if (chatSendSim) chatSendSim.disabled = true;

    laudoHandlers.resetLaudo();
    destruirGraficos();
  }

  // =========================
  //      BUSCA DE CIDADES
  // =========================
  if (destinoUfSelect && destinoCidadeInput && cidadesDatalist) {
    destinoUfSelect.addEventListener("change", async (e) => {
      const uf = e.target.value;

      destinoCidadeInput.value = "";
      cidadesDatalist.innerHTML = "";
      destinoUfSelect.classList.remove("border-red-500");
      destinoCidadeInput.classList.remove("border-red-500");

      if (!uf) {
        destinoCidadeInput.disabled = true;
        destinoCidadeInput.placeholder = "Selecione a UF primeiro";
        return;
      }

      destinoCidadeInput.disabled = true;
      destinoCidadeInput.placeholder = "Carregando cidades...";

      try {
        const response = await fetch(
          `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`,
        );
        if (!response.ok) {
          throw new Error("Não foi possível carregar as cidades.");
        }
        const cidades = await response.json();
        cidades.forEach((cidade) => {
          const option = document.createElement("option");
          option.value = cidade.nome;
          cidadesDatalist.appendChild(option);
        });

        destinoCidadeInput.disabled = false;
        destinoCidadeInput.placeholder = "Digite ou selecione a cidade";
      } catch (error) {
        console.error("Erro ao buscar cidades:", error);
        destinoCidadeInput.disabled = true;
        destinoCidadeInput.placeholder = "Erro ao carregar cidades";
        destinoCidadeInput.classList.add("border-red-500");
      }
    });

    destinoCidadeInput.addEventListener("input", () => {
      destinoCidadeInput.classList.remove("border-red-500");
    });
  }

  // =========================
  //        SIMULAÇÃO
  // =========================
  function clearErrors() {
    if (destinoUfSelect) destinoUfSelect.classList.remove("border-red-500");
    if (destinoCidadeInput)
      destinoCidadeInput.classList.remove("border-red-500");
    if (emailParaEnvio) emailParaEnvio.classList.remove("border-red-500");
    if (precoNetInput) precoNetInput.classList.remove("border-red-500");
    if (refinariaSelect) refinariaSelect.classList.remove("border-red-500");
  }

  async function handleSimular() {
    if (!simulacaoForm) return;
    clearErrors();

    if (!destinoUfSelect || !destinoUfSelect.value) {
      destinoUfSelect.classList.add("border-red-500");
      alert("Por favor, selecione a UF de Destino.");
      return;
    }

    if (!destinoCidadeInput || !destinoCidadeInput.value) {
      destinoCidadeInput.classList.add("border-red-500");
      alert("Por favor, digite ou selecione a Cidade de Destino.");
      return;
    }

    // Regra: Se Preço Net preenchido -> Refinaria obrigatória
    if (precoNetInput && precoNetInput.value.trim() !== "") {
      if (!refinariaSelect || !refinariaSelect.value) {
        refinariaSelect.classList.add("border-red-500");
        alert("Ao informar o Preço Net, é obrigatório selecionar uma Refinaria específica.");
        return;
      }
    }

    showLoading();
    const formData = new FormData(simulacaoForm);

    const contextoForm = {
      destino: `${destinoCidadeInput.value} / ${destinoUfSelect.value}`,
      quantidade: Number(formData.get("quantidade")) || 0,
      precoNet: Number(formData.get("preco_net")) || 0,
      margem: Number(formData.get("margem")) || 0,
      refinaria: formData.get("refinaria") || "",
    };

    try {
      const apiResult = await fetchSimulacao(formData);

      // 1) Mapper de cenários (agora mais robusto)
      const { opcoes } = normalizarResposta(apiResult, contextoForm);

      // 2) Mapper separado só para o HTML do laudo
      const laudoHtml = extrairLaudoHtml(apiResult);

      console.log("📊 opcoes normalizadas:", opcoes);
      console.log("📄 laudoHtml (laudo mapper) presente?", !!laudoHtml);

      if (!opcoes || opcoes.length === 0) {
        throw new Error("Simulação não retornou opções válidas.");
      }

      // Prioriza o HTML vindo do mapper de laudo
      laudoHandlers.setLaudoHtml(laudoHtml || opcoes[0]?.laudoHtml || null);

      showResults(opcoes);
    } catch (error) {
      console.error("Erro ao buscar simulação:", error);
      showProfile();
      alert("Erro na simulação: " + error.message);
    }
  }

  if (btnSimular) btnSimular.addEventListener("click", handleSimular);

  // =========================
  //          TABS
  // =========================
  if (tabButtons && tabButtons.length) {
    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        tabButtons.forEach((btn) => btn.classList.remove("active"));
        button.classList.add("active");

        const tabIndex = parseInt(button.id.split("-")[1], 10) - 1;
        if (currentSimulationResults[tabIndex]) {
          displayResultadosCombinados(currentSimulationResults[tabIndex]);
        }
      });
    });
  }

  if (
    graficoTabPreco &&
    graficoContentPreco &&
    graficoContentFrete &&
    graficoContentMargem
  ) {
    graficoTabPreco.addEventListener("click", () => {
      graficoTabPreco.classList.add("active");
      graficoTabFrete.classList.remove("active");
      graficoTabMargem.classList.remove("active");
      graficoContentPreco.classList.remove("hidden");
      graficoContentFrete.classList.add("hidden");
      graficoContentMargem.classList.add("hidden");
    });
  }

  if (
    graficoTabFrete &&
    graficoContentPreco &&
    graficoContentFrete &&
    graficoContentMargem
  ) {
    graficoTabFrete.addEventListener("click", () => {
      graficoTabPreco.classList.remove("active");
      graficoTabFrete.classList.add("active");
      graficoTabMargem.classList.remove("active");
      graficoContentPreco.classList.add("hidden");
      graficoContentFrete.classList.remove("hidden");
      graficoContentMargem.classList.add("hidden");
    });
  }

  if (
    graficoTabMargem &&
    graficoContentPreco &&
    graficoContentFrete &&
    graficoContentMargem
  ) {
    graficoTabMargem.addEventListener("click", () => {
      graficoTabPreco.classList.remove("active");
      graficoTabFrete.classList.remove("active");
      graficoTabMargem.classList.add("active");
      graficoContentPreco.classList.add("hidden");
      graficoContentFrete.classList.add("hidden");
      graficoContentMargem.classList.remove("hidden");
    });
  }

  // =========================
  //     CHAT - HELPERS
  // =========================
  function montarMensagemSimulacao(opcoes) {
    if (!opcoes || !opcoes.length) return "";

    const linhas = [];
    linhas.push("Compartilhando a simulação atual:");

    opcoes.forEach((opcao, idx) => {
      const origem =
        opcao.refinaria ||
        opcao.refinariaNome ||
        opcao.origem ||
        "Origem não informada";
      const destino =
        opcao.destino || opcao.destinoCidade || "Destino não informado";
      const qtd = opcao.quantidade ?? 0;
      const frete = formatCurrency(opcao.frete || 0);
      const precoFinal = formatCurrency(opcao.precoFinal || 0);
      const margem = formatPercent(opcao.margem || 0);

      linhas.push(
        `Opção ${idx + 1}: Origem ${origem}, Destino ${destino}, ` +
          `Qtd ${qtd} ton, Frete ${frete}, Margem ${margem}, Preço Final ${precoFinal}.`,
      );
    });

    return linhas.join("\n");
  }

  const sendChatMessage = async (text) => {
    if (!chatWindow || !aiTyping) return;
    if (!text || !text.trim()) return;

    // --- bolha do usuário ---
    const userBubble = document.createElement("div");
    userBubble.className = "flex justify-end";
    userBubble.innerHTML =
      '<div class="bg-teal-600 text-white p-2 px-3 rounded-lg max-w-xs whitespace-pre-line"><p class="text-sm">' +
      text +
      "</p></div>";
    chatWindow.appendChild(userBubble);

    // 🔥 move o indicador de digitando para o FINAL do chat
    chatWindow.appendChild(aiTyping);
    aiTyping.classList.remove("hidden");

    chatWindow.scrollTop = chatWindow.scrollHeight;

    if (chatSend) chatSend.disabled = true;
    if (chatSendSim) chatSendSim.disabled = true;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          session_id: chatSessionId,
        }),
      });
      const data = await response.json();
      console.log("🔎 /api/chat status:", response.status, "body:", data);

      if (!response.ok) throw new Error(data.reply || "Erro na resposta da API");

      const aiMessage = data.reply;
      const aiBubble = document.createElement("div");
      aiBubble.className = "flex justify-start";
      aiBubble.innerHTML =
        '<div class="bg-gray-200 text-gray-800 p-2 px-3 rounded-lg max-w-xs whitespace-pre-line"><p class="text-sm">' +
        aiMessage +
        "</p></div>";
      aiTyping.classList.add("hidden");
      chatWindow.appendChild(aiBubble);
    } catch (error) {
      console.error("Erro chat:", error);
      aiTyping.classList.add("hidden");
      const errorBubble = document.createElement("div");
      errorBubble.className = "flex justify-start";
      errorBubble.innerHTML =
        '<div class="bg-red-100 text-red-700 p-2 px-3 rounded-lg max-w-xs"><p class="text-sm">Erro: ' +
        error.message +
        "</p></div>";
      chatWindow.appendChild(errorBubble);
    } finally {
      if (chatSend) chatSend.disabled = false;
      if (chatSendSim && currentSimulationResults.length > 0) {
        chatSendSim.disabled = false;
      }
      chatWindow.scrollTop = chatWindow.scrollHeight;
      if (chatInput) chatInput.focus();
    }
  };

  // =========================
  //           CHAT
  // =========================
  const handleChatSend = async () => {
    if (!chatInput) return;
    const text = chatInput.value;
    if (text.trim() === "") return;
    chatInput.value = "";
    await sendChatMessage(text);
  };

  const handleChatSendSim = async () => {
    if (!currentSimulationResults || currentSimulationResults.length === 0) {
      alert("Realize uma simulação antes de enviar os dados para o chat.");
      return;
    }
    const resumo = montarMensagemSimulacao(currentSimulationResults);
    await sendChatMessage(resumo);
  };

  if (chatSend) {
    chatSend.addEventListener("click", handleChatSend);
  }
  if (chatInput) {
    chatInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleChatSend();
      }
    });
  }
  if (chatSendSim) {
    chatSendSim.addEventListener("click", handleChatSendSim);
  }

  // =========================
  //          VOLTAR
  // =========================
  if (btnVoltar) {
    btnVoltar.addEventListener("click", showProfile);
  }

  // =========================
  //          LOGOUT
  // =========================
  if (btnLogout) {
    btnLogout.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "/logout";
    });
  }

  // Estado inicial
  showProfile();
}
