// app/static/js/pages/laboratorio.js
import { qs, apiGet, apiPost, apiPut, setFormValues, getFormValues } from "./_shared.js";

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
  if (type === "flask") return `<svg ${common}><path d="M10 2v6l-5 9a4 4 0 0 0 3.5 6h7A4 4 0 0 0 19 17l-5-9V2" stroke="currentColor" stroke-width="2"/><path d="M8 8h8" stroke="currentColor" stroke-width="2"/></svg>`;
  if (type === "check") return `<svg ${common}><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
  const cols = ["chave", "ov_remessa", "produto", "lote", "data_liberacao"];
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

async function confirmEnviarFaturamento({ pedido, ov }) {
  if (window.Swal && typeof window.Swal.fire === "function") {
    const res = await window.Swal.fire({
      icon: undefined,
      title: undefined,
      html: `
        <div class="cap-swal">
          <div class="cap-swal__header">
            <div class="cap-swal__icon">${sendIcon()}</div>
            <div class="cap-swal__title">Enviar para Faturamento?</div>
          </div>

          <div class="cap-swal__meta">
            <span class="badge text-bg-light border">Pedido: <b>${pedido}</b></span>
            <span class="badge text-bg-light border">OV: <b>${ov}</b></span>
          </div>

          <div class="cap-swal__text">
            Ao confirmar, o pedido será movido para a próxima fila e sairá do Laboratório.
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

  return window.confirm(`Enviar para Faturamento?\n\nPedido: ${pedido}\nOV: ${ov}`);
}

// ===============================
// Laboratório
// ===============================
export async function initLaboratorio() {
  const kpiRow = qs("#kpiRowLaboratorio");
  const tbody = qs("#tbody");
  const busca = qs("#busca");
  const btnExportar = qs("#btnExportar");

  const modalEl = document.getElementById("modalForm");
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;

  const form = qs("#form");
  const btnSalvar = qs("#btnSalvar");

  const laboratorioPedidoKey = qs("#laboratorioPedidoKey");
  const laboratorioPedidoOv = qs("#laboratorioPedidoOv");

  let cacheItems = [];
  let editingId = null;

  async function load() {
    const q = (busca?.value || "").trim();
    const url = `/api/pedidos?stage=laboratorio${q ? `&busca=${encodeURIComponent(q)}` : ""}`;
    const data = await apiGet(url);
    const items = data.items || [];
    cacheItems = items;

    // KPIs
    const total = items.length;
    const semLote = items.filter(p => !safeText(p.lote).trim()).length;
    const semLiberacao = items.filter(p => !safeText(p.data_liberacao).trim()).length;

    if (kpiRow) {
      kpiRow.innerHTML = [
        buildKpiCard({ label: "EM LABORATÓRIO", value: total, iconType: "db", iconBg: "#eef2ff", iconColor: "#3730a3" }),
        buildKpiCard({ label: "SEM LOTE", value: semLote, iconType: "flask", iconBg: "#fff7ed", iconColor: "#9a3412" }),
        buildKpiCard({ label: "SEM LIBERAÇÃO", value: semLiberacao, iconType: "check", iconBg: "#ecfdf5", iconColor: "#16a34a" }),
        buildKpiCard({ label: "PENDENTES", value: semLote + semLiberacao, iconType: "edit", iconBg: "#f3e8ff", iconColor: "#7c3aed" }),
      ].join("");
    }

    tbody.innerHTML = items.map(p => {
      const ov = safeText(p.ov_remessa || "-");
      const produto = safeText(p.produto || "-");
      const lote = safeText(p.lote || "-");
      const liberacao = safeText(p.data_liberacao || "-");

      return `
        <tr>
          <td><span class="status-pill pill-laboratorio">LABORATÓRIO</span></td>
          <td class="font-monospace nowrap-ellipsis" title="${ov}">${ov}</td>
          <td class="nowrap-ellipsis" title="${produto}">${produto}</td>
          <td class="nowrap-ellipsis" title="${lote}">${lote}</td>
          <td class="nowrap-ellipsis" title="${liberacao}">${liberacao}</td>
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

    if (item?.status && item.status !== "laboratorio") {
      alert("Este pedido não está na etapa Laboratório e não pode ser editado aqui.");
      return;
    }

    form?.reset();
    setFormValues(form, item);

    const pedido = safeText(item.chave || item.id || "-");
    const ov = safeText(item.ov_remessa || "-");
    if (laboratorioPedidoKey) laboratorioPedidoKey.textContent = `Pedido: ${pedido}`;
    if (laboratorioPedidoOv) laboratorioPedidoOv.textContent = `OV: ${ov}`;

    modal?.show();
  }

  async function save() {
    const v = getFormValues(form);
    const id = v.id ? Number(v.id) : Number(editingId);
    delete v.id;

    const payload = {
      lote: v.lote,
      data_liberacao: v.data_liberacao,
      obs_laboratorio: v.obs_laboratorio,
      status: "laboratorio",
    };

    await apiPut(`/api/pedidos/${id}`, payload);
    modal?.hide();
    await load();
  }

  async function enviarProximaFila(id) {
    try {
      const data = await apiGet(`/api/pedidos/${id}`);
      const item = data.item;

      if (item?.status && item.status !== "laboratorio") {
        alert("Este pedido não está na etapa Laboratório e não pode ser enviado por aqui.");
        return;
      }

      const pedido = safeText(item.chave || item.id || "-");
      const ov = safeText(item.ov_remessa || "-");

      const ok = await confirmEnviarFaturamento({ pedido, ov });
      if (!ok) return;

      try {
        await apiPost(`/api/pedidos/${id}/advance`, {});
      } catch (_) {
        await apiPut(`/api/pedidos/${id}`, { status: "faturamento" });
      }

      modal?.hide();
      await load();
    } catch (e) {
      alert(e?.message || "Erro ao enviar para a próxima etapa.");
    }
  }

  // Eventos
  btnSalvar?.addEventListener("click", () => save().catch(e => alert(e.message)));

  btnExportar?.addEventListener("click", () => {
    const csv = toCSV(cacheItems);
    download(`laboratorio_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
  });

  let t = null;
  busca?.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => load().catch(e => alert(e.message)), 250);
  });

  load().catch(e => alert(e.message));
}
