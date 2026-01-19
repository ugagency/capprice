// app/static/js/pages/programacao.js
import { qs, apiGet, apiPost, apiPut, fillSelect, setFormValues, getFormValues } from "./_shared.js";

// ===============================
// Helpers
// ===============================
function safeText(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return (v.nome ?? v.name ?? v.descricao ?? v.label ?? v.value ?? "");
  return String(v);
}

function iconSVG(type) {
  const common = `width="18" height="18" viewBox="0 0 24 24" fill="none"`;
  if (type === "db") return `<svg ${common}><path d="M12 3c4.418 0 8 1.343 8 3s-3.582 3-8 3-8-1.343-8-3 3.582-3 8-3Z" stroke="currentColor" stroke-width="2"/><path d="M4 6v6c0 1.657 3.582 3 8 3s8-1.343 8-3V6" stroke="currentColor" stroke-width="2"/><path d="M4 12v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6" stroke="currentColor" stroke-width="2"/></svg>`;
  if (type === "cal") return `<svg ${common}><path d="M8 2v3M16 2v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 9h18" stroke="currentColor" stroke-width="2"/><path d="M5 5h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="2"/></svg>`;
  if (type === "truck") return `<svg ${common}><path d="M3 7h11v10H3z" stroke="currentColor" stroke-width="2"/><path d="M14 10h4l3 3v4h-7v-7Z" stroke="currentColor" stroke-width="2"/><path d="M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" stroke-width="2"/></svg>`;
  return `<svg ${common}><path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
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
            <div class="kpi-label">${label}</div>
            <div class="kpi-value">${value}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function toCSV(items) {
  const cols = ["chave", "ov_remessa", "cliente", "refinaria", "agendamento_refinaria", "hora_agendamento", "transportador"];
  const head = cols.join(";");
  const lines = items.map(p => cols.map(c => safeText(p?.[c]).replaceAll(";", ",")).join(";"));
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

// ===============================
// SweetAlert2 (CAP)
// ===============================
function sendIcon() {
  return `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22 2 11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

async function confirmEnviarIndustrial({ pedido, ov }) {
  if (window.Swal && typeof window.Swal.fire === "function") {
    const res = await window.Swal.fire({
      icon: undefined,
      title: undefined,
      html: `
        <div class="cap-swal">
          <div class="cap-swal__header">
            <div class="cap-swal__icon">${sendIcon()}</div>
            <div class="cap-swal__title">Enviar para Industrial?</div>
          </div>

          <div class="cap-swal__meta">
            <span class="badge text-bg-light border">Pedido: <b>${pedido}</b></span>
            <span class="badge text-bg-light border">OV: <b>${ov}</b></span>
          </div>

          <div class="cap-swal__text">
            Ao confirmar, o pedido será movido para a próxima fila e sairá da Programação.
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Sim, enviar",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
      focusCancel: true,
      customClass: {
        popup: "cap-swal2-popup",
        htmlContainer: "cap-swal2-html",
        actions: "cap-swal2-actions",
        confirmButton: "btn btn-success btn-sm",
        cancelButton: "btn btn-light btn-sm",
      },
      buttonsStyling: false,
    });
    return !!res.isConfirmed;
  }

  return window.confirm(`Enviar para Industrial?\n\nPedido: ${pedido}\nOV: ${ov}`);
}

// ===============================
// Programação
// ===============================
export async function initProgramacao() {
  const kpiRow = qs("#kpiRowProgramacao");
  const tbody = qs("#tbody");
  const busca = qs("#busca");
  const btnExportar = qs("#btnExportar");

  const modalEl = document.getElementById("modalForm");
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;
  const form = qs("#form");

  const btnSalvar = qs("#btnSalvar");

  const programacaoPedidoKey = qs("#programacaoPedidoKey");
  const programacaoPedidoOv = qs("#programacaoPedidoOv");

  let cacheItems = [];
  let editingId = null;

  const aux = await apiGet("/api/auxiliares");
  fillSelect(form?.querySelector("[name=refinaria]"), aux.refinarias || []);
  fillSelect(form?.querySelector("[name=transportador]"), aux.transportadores || []);

  async function load() {
    const q = (busca?.value || "").trim();
    const url = `/api/pedidos?stage=programacao${q ? `&busca=${encodeURIComponent(q)}` : ""}`;
    const data = await apiGet(url);
    const items = data.items || [];
    cacheItems = items;

    const total = items.length;
    const semRefinaria = items.filter(p => !safeText(p.refinaria).trim()).length;
    const semAgend = items.filter(p => !safeText(p.agendamento_refinaria).trim()).length;
    const semTransportador = items.filter(p => !safeText(p.transportador).trim()).length;

    if (kpiRow) {
      kpiRow.innerHTML = [
        buildKpiCard({ label: "EM PROGRAMAÇÃO", value: total, iconType: "db", iconBg: "#eef2ff", iconColor: "#3730a3" }),
        buildKpiCard({ label: "SEM REFINARIA", value: semRefinaria, iconType: "edit", iconBg: "#fff7ed", iconColor: "#9a3412" }),
        buildKpiCard({ label: "SEM AGENDAMENTO", value: semAgend, iconType: "cal", iconBg: "#f3e8ff", iconColor: "#7c3aed" }),
        buildKpiCard({ label: "SEM TRANSPORTADOR", value: semTransportador, iconType: "truck", iconBg: "#ecfdf5", iconColor: "#16a34a" }),
      ].join("");
    }

    tbody.innerHTML = items.map(p => {
      const ov = safeText(p.ov_remessa || "-");
      const cliente = safeText(p.cliente || "-");
      const refinaria = safeText(p.refinaria || "-");
      const agend = safeText(p.agendamento_refinaria || "-");
      const transp = safeText(p.transportador || "-");

      return `
        <tr>
          <td><span class="status-pill pill-programacao">PROGRAMAÇÃO</span></td>
          <td class="font-monospace nowrap-ellipsis" title="${ov}">${ov}</td>
          <td class="td-cliente"><div class="cell-wrap nowrap-ellipsis" title="${cliente}">${cliente}</div></td>
          <td class="nowrap-ellipsis" title="${refinaria}">${refinaria}</td>
          <td class="nowrap-ellipsis" title="${agend}">${agend}</td>
          <td class="nowrap-ellipsis" title="${transp}">${transp}</td>
          <td class="text-end">
            <div class="d-inline-flex gap-2">
              <button class="btn btn-sm btn-outline-primary row-action" data-edit="${p.id}">Editar</button>
              <button class="btn btn-sm btn-success row-action" data-send="${p.id}">Enviar</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-edit]").forEach(b =>
      b.addEventListener("click", () => openEdit(Number(b.dataset.edit)))
    );
    tbody.querySelectorAll("[data-send]").forEach(b =>
      b.addEventListener("click", () => enviarProximaFila(Number(b.dataset.send)))
    );
  }

  async function openEdit(id) {
    editingId = id;

    const data = await apiGet(`/api/pedidos/${id}`);
    const item = data.item;

    if (item?.status && item.status !== "programacao") {
      alert("Este pedido não está na etapa Programação e não pode ser editado aqui.");
      return;
    }

    form?.reset();
    setFormValues(form, item);

    const pedido = safeText(item.chave || item.id || "-");
    const ov = safeText(item.ov_remessa || "-");
    if (programacaoPedidoKey) programacaoPedidoKey.textContent = `Pedido: ${pedido}`;
    if (programacaoPedidoOv) programacaoPedidoOv.textContent = `OV: ${ov}`;

    modal?.show();
  }

  async function save() {
    const v = getFormValues(form);
    const id = v.id ? Number(v.id) : Number(editingId);
    delete v.id;

    const payload = {
      refinaria: v.refinaria,
      agendamento_refinaria: v.agendamento_refinaria,
      hora_agendamento: v.hora_agendamento,
      transportador: v.transportador,
      placa_cavalo: v.placa_cavalo,
      placa_carreta: v.placa_carreta,
      motorista: v.motorista,
      solicitacao_remessa: v.solicitacao_remessa,
      nova_data_ov_venda: v.nova_data_ov_venda,
      pedido_remessa: v.pedido_remessa,
      status: "programacao",
    };

    await apiPut(`/api/pedidos/${id}`, payload);
    modal?.hide();
    await load();
  }

  async function enviarProximaFila(id) {
    try {
      const data = await apiGet(`/api/pedidos/${id}`);
      const item = data.item;

      if (item?.status && item.status !== "programacao") {
        alert("Este pedido não está na etapa Programação e não pode ser enviado por aqui.");
        return;
      }

      const pedido = safeText(item.chave || item.id || "-");
      const ov = safeText(item.ov_remessa || "-");

      const ok = await confirmEnviarIndustrial({ pedido, ov });
      if (!ok) return;

      // endpoint oficial
      try {
        await apiPost(`/api/pedidos/${id}/advance`, {});
      } catch (_) {
        await apiPut(`/api/pedidos/${id}`, { status: "industrial" });
      }

      modal?.hide();
      await load();
    } catch (e) {
      alert(e.message || "Erro ao enviar para próxima fila.");
    }
  }

  btnSalvar?.addEventListener("click", () => save().catch(e => alert(e.message)));

  btnExportar?.addEventListener("click", () => {
    const csv = toCSV(cacheItems);
    download(`programacao_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
  });

  let t = null;
  busca?.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => load().catch(e => alert(e.message)), 250);
  });

  load().catch(e => alert(e.message));
}
