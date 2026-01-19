// app/static/js/pages/mestre.js
import {
  qs, apiGet, apiPost, apiPut,
  fillSelect, setFormValues, getFormValues,
  safeText, safeHtml,
  requireAccess, canAccess
} from "./_shared.js";

const FLOW = ["comercial", "programacao", "industrial", "laboratorio", "faturamento", "finalizado"];

function statusLabel(st) {
  const map = {
    comercial: "COMERCIAL",
    programacao: "PROGRAMADO",
    industrial: "INDUSTRIAL",
    laboratorio: "LABORATÓRIO",
    faturamento: "AGUARD. FATURAR",
    finalizado: "CONCLUÍDO",
  };
  return map[st] || safeText(st || "-").toUpperCase();
}

function statusPillClass(st) {
  const map = {
    comercial: "pill-comercial",
    programacao: "pill-programacao",
    industrial: "pill-industrial",
    laboratorio: "pill-laboratorio",
    faturamento: "pill-faturamento",
    finalizado: "pill-finalizado",
  };
  return map[st] || "pill-finalizado";
}

function healthPct(st) {
  const idx = Math.max(0, FLOW.indexOf(st));
  const pct = Math.round((idx / (FLOW.length - 1)) * 100);
  return isFinite(pct) ? pct : 0;
}

function healthColor(pct) {
  if (pct >= 80) return "#16a34a";
  if (pct >= 50) return "#f59e0b";
  return "#2563eb";
}

function iconSVG(type) {
  const common = `width="18" height="18" viewBox="0 0 24 24" fill="none"`;
  if (type === "db") return `<svg ${common}><path d="M12 3c4.418 0 8 1.343 8 3s-3.582 3-8 3-8-1.343-8-3 3.582-3 8-3Z" stroke="currentColor" stroke-width="2"/><path d="M4 6v6c0 1.657 3.582 3 8 3s8-1.343 8-3V6" stroke="currentColor" stroke-width="2"/><path d="M4 12v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6" stroke="currentColor" stroke-width="2"/></svg>`;
  if (type === "op") return `<svg ${common}><path d="M7 4h10v16H7z" stroke="currentColor" stroke-width="2"/><path d="M9 8h6M9 12h6M9 16h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  if (type === "money") return `<svg ${common}><path d="M4 6h16v12H4z" stroke="currentColor" stroke-width="2"/><path d="M12 9v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 10.5c0-.828.895-1.5 2-1.5s2 .672 2 1.5-1 1.5-2 1.5-2 .672-2 1.5.895 1.5 2 1.5 2-.672 2-1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  if (type === "print") return `<svg ${common}><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 14h12v8H6z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `<svg ${common}><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function buildKpiCard({ label, value, iconType, iconBg, iconColor }) {
  return `
    <div class="col-12 col-md-6 col-xl-3">
      <div class="card kpi-card border-0 shadow-sm">
        <div class="kpi-body">
          <div class="kpi-icon" style="background:${iconBg}; color:${iconColor};">
            ${iconSVG(iconType)}
          </div>
          <div class="min-w-0">
            <div class="kpi-label">${safeHtml(label)}</div>
            <div class="kpi-value">${safeHtml(value)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function toCSV(items) {
  const cols = ["chave", "ov_remessa", "cliente", "produto", "status", "qtde_solicitada", "refinaria", "transportador", "numero_nf"];
  const head = cols.join(";");
  const lines = (items || []).map(p =>
    cols.map(c => safeText(p?.[c]).replaceAll(";", ",")).join(";")
  );
  return [head, ...lines].join("\n");
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function initMestre() {
  if (!requireAccess("mestre")) return;

  const kpiRow = qs("#kpiRow");
  const tbody = qs("#tbody");
  const busca = qs("#busca");
  const btnNovo = qs("#btnNovo");
  const btnExportar = qs("#btnExportar");

  // Modal Mestre
  const modalEl = document.getElementById("modalMestreEdit");
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;

  const formComercial = qs("#formMestreComercial");
  const formProgramacao = qs("#formMestreProgramacao");
  const formIndustrial = qs("#formMestreIndustrial");
  const formLaboratorio = qs("#formMestreLaboratorio");
  const formFaturamento = qs("#formMestreFaturamento");

  const mestreStatus = qs("#mestreStatus");
  const mestrePedidoKey = qs("#mestrePedidoKey");
  const mestrePedidoOv = qs("#mestrePedidoOv");
  const btnMestreSalvar = qs("#btnMestreSalvar");

  if (!kpiRow || !tbody) return;

  let cacheItems = [];
  let editingId = null;

  // criação nasce no Comercial
  if (btnNovo) btnNovo.disabled = !canAccess("comercial");

  // Auxiliares
  const aux = await apiGet("/api/auxiliares");

  fillSelect(formComercial?.querySelector("[name=cif_fob]"), aux.cif_fob || []);
  fillSelect(formComercial?.querySelector("[name=produto]"), aux.produtos || []);
  fillSelect(formComercial?.querySelector("[name=uf_entrega]"), aux.ufs || []);
  fillSelect(formComercial?.querySelector("[name=assessor]"), aux.assessores || []);
  fillSelect(formComercial?.querySelector("[name=assistente]"), aux.assistentes || []);

  fillSelect(formProgramacao?.querySelector("[name=refinaria]"), aux.refinarias || []);
  fillSelect(formProgramacao?.querySelector("[name=transportador]"), aux.transportadores || []);

  fillSelect(formLaboratorio?.querySelector("[name=confirmacao_pedido_remessa]"), aux.ok_nok || []);
  fillSelect(formFaturamento?.querySelector("[name=faturista]"), aux.faturistas || []);
  fillSelect(formFaturamento?.querySelector("[name=problema_faturar]"), aux.problemas || []);

  function clearAllForms() {
    formComercial?.reset();
    formProgramacao?.reset();
    formIndustrial?.reset();
    formLaboratorio?.reset();
    formFaturamento?.reset();

    const idInput = formComercial?.querySelector("[name=id]");
    if (idInput) idInput.value = "";
  }

  async function load() {
    const q = (busca?.value || "").trim();
    const url = `/api/pedidos?stage=mestre${q ? `&busca=${encodeURIComponent(q)}` : ""}`;
    const data = await apiGet(url);
    const items = data.items || [];
    cacheItems = items;

    const totalAtivos = items.filter(p => p.status !== "finalizado").length;
    const emOperacao = items.filter(p => p.status !== "finalizado").length;
    const aguardFaturar = items.filter(p => p.status === "faturamento").length;
    const concluidos = items.filter(p => p.status === "finalizado").length;

    kpiRow.innerHTML = [
      buildKpiCard({ label: "TOTAL ATIVOS", value: totalAtivos, iconType: "db", iconBg: "#eef2ff", iconColor: "#4338ca" }),
      buildKpiCard({ label: "EM OPERAÇÃO", value: emOperacao, iconType: "op", iconBg: "#f3e8ff", iconColor: "#7c3aed" }),
      buildKpiCard({ label: "AGUARD. FATURAR", value: aguardFaturar, iconType: "money", iconBg: "#fff7ed", iconColor: "#ea580c" }),
      buildKpiCard({ label: "CONCLUÍDOS", value: concluidos, iconType: "check", iconBg: "#ecfdf5", iconColor: "#16a34a" }),
    ].join("");

    tbody.innerHTML = items.map(p => {
      const pct = healthPct(p.status);
      const fill = Math.max(6, Math.min(100, pct));
      const barColor = healthColor(pct);

      const cliente = safeText(p.cliente) || "-";
      const produto = safeText(p.produto) || "-";
      const ov = safeText(p.ov_remessa) || "-";

      return `
        <tr>
          <td><span class="status-pill ${statusPillClass(p.status)}">${safeHtml(statusLabel(p.status))}</span></td>
          <td class="fw-semibold nowrap-ellipsis" title="${safeHtml(cliente)}">${safeHtml(cliente)}</td>
          <td class="nowrap-ellipsis" title="${safeHtml(produto)}">${safeHtml(produto)}</td>
          <td class="text-muted small font-monospace nowrap-ellipsis" title="${safeHtml(ov)}">${safeHtml(ov)}</td>
          <td>
            <div class="health-wrap">
              <div class="health-bar">
                <div class="health-fill" style="width:${fill}%; background:${barColor};"></div>
              </div>
              <div class="health-text">${pct}%</div>
            </div>
          </td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-secondary me-1 row-action" data-print="${p.id}" title="Imprimir PDF">${iconSVG("print")}</button>
            <button class="btn btn-sm btn-outline-primary row-action" data-edit="${p.id}">Editar</button>
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-edit]").forEach(b => {
      b.addEventListener("click", () => openEdit(Number(b.dataset.edit)));
    });

    tbody.querySelectorAll("[data-print]").forEach(b => {
      b.addEventListener("click", () => {
        const id = b.dataset.print;
        window.open(`/pedidos/${id}/pdf`, "_blank");
      });
    });
  }

  function openNew() {
    if (!canAccess("comercial")) {
      alert("Sem permissão para criar pedido (Comercial).");
      return;
    }

    if (!modal || !mestrePedidoKey || !mestrePedidoOv || !mestreStatus) {
      alert("Modal do Mestre não está disponível. Verifique o include do template do modal.");
      return;
    }

    editingId = null;
    clearAllForms();

    mestrePedidoKey.textContent = "Pedido: (novo)";
    mestrePedidoOv.textContent = "OV: -";
    mestreStatus.value = "comercial";

    modal.show();
  }

  async function openEdit(id) {
    if (!modal || !mestrePedidoKey || !mestrePedidoOv || !mestreStatus) {
      alert("Modal do Mestre não está disponível. Verifique o include do template do modal.");
      return;
    }

    const item = cacheItems.find(p => p.id === id) || await apiGet(`/api/pedidos/${id}`);
    if (!item) return;

    editingId = id;

    mestrePedidoKey.textContent = `Pedido: ${safeText(item.chave) || "-"}`;
    mestrePedidoOv.textContent = `OV: ${safeText(item.ov_remessa) || "-"}`;
    mestreStatus.value = item.status || "comercial";

    // preencher forms
    setFormValues(formComercial, item);
    setFormValues(formProgramacao, item);
    setFormValues(formIndustrial, item);
    setFormValues(formLaboratorio, item);
    setFormValues(formFaturamento, item);

    // garantir hidden id
    const idInput = formComercial?.querySelector("[name=id]");
    if (idInput) idInput.value = String(id);

    modal.show();
  }

  async function saveAll() {
    const status = mestreStatus?.value || "comercial";

    // payload completo (merge das abas)
    const payload = {
      ...(getFormValues(formComercial) || {}),
      ...(getFormValues(formProgramacao) || {}),
      ...(getFormValues(formIndustrial) || {}),
      ...(getFormValues(formLaboratorio) || {}),
      ...(getFormValues(formFaturamento) || {}),
      status,
    };

    if (editingId) {
      await apiPut(`/api/pedidos/${editingId}`, payload);
    } else {
      if (!canAccess("comercial")) {
        alert("Sem permissão para criar pedido (Comercial).");
        return;
      }
      await apiPost(`/api/pedidos`, payload);
    }

    modal?.hide();
    await load();
  }

  // eventos
  if (btnNovo) btnNovo.addEventListener("click", openNew);
  if (busca) busca.addEventListener("input", () => load());

  if (btnExportar) {
    btnExportar.addEventListener("click", () => {
      const csv = toCSV(cacheItems);
      download("pedidos.csv", csv, "text/csv;charset=utf-8");
    });
  }

  if (btnMestreSalvar) {
    btnMestreSalvar.addEventListener("click", async (e) => {
      e.preventDefault();
      await saveAll();
    });
  }

  await load();
}
