import { qs, apiGet, apiPost, apiPut, fillSelect, setFormValues, getFormValues } from "./_shared.js";

// ===============================
// Helpers
// ===============================
function safeText(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    return (v.nome ?? v.name ?? v.descricao ?? v.label ?? v.value ?? "");
  }
  return String(v);
}

function iconSVG(type) {
  const common = `width="18" height="18" viewBox="0 0 24 24" fill="none"`;
  if (type === "db") return `<svg ${common}><path d="M12 3c4.418 0 8 1.343 8 3s-3.582 3-8 3-8-1.343-8-3 3.582-3 8-3Z" stroke="currentColor" stroke-width="2"/><path d="M4 6v6c0 1.657 3.582 3 8 3s8-1.343 8-3V6" stroke="currentColor" stroke-width="2"/><path d="M4 12v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6" stroke="currentColor" stroke-width="2"/></svg>`;
  if (type === "user") return `<svg ${common}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" stroke-width="2"/></svg>`;
  if (type === "box") return `<svg ${common}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73Z" stroke="currentColor" stroke-width="2"/><path d="M3.3 7.3 12 12l8.7-4.7" stroke="currentColor" stroke-width="2"/><path d="M12 22V12" stroke="currentColor" stroke-width="2"/></svg>`;
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
  const cols = ["chave", "data", "ov_remessa", "cliente", "produto"];
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

function statusLabel() { return "COMERCIAL"; }
function statusPillClass() { return "pill-comercial"; }

// ===============================
// SweetAlert2 (design melhor)
// ===============================
function sendIcon() {
  // Ícone “enviar” (paper plane) minimalista
  return `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22 2 11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

async function confirmEnviar({ pedido, ov }) {
  if (window.Swal && typeof window.Swal.fire === "function") {
    const res = await window.Swal.fire({
      // Remove o ícone gigante do SweetAlert2 e usa um header custom
      icon: undefined,
      title: undefined,

      html: `
        <div class="cap-swal">
          <div class="cap-swal__header">
            <div class="cap-swal__icon">${sendIcon()}</div>
            <div class="cap-swal__title">Enviar para Programação?</div>
          </div>

          <div class="cap-swal__meta">
            <span class="badge text-bg-light border">Pedido: <b>${pedido}</b></span>
            <span class="badge text-bg-light border">OV: <b>${ov}</b></span>
          </div>

          <div class="cap-swal__text">
            Ao confirmar, o pedido será movido para a próxima fila e sairá do Comercial.
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

  // Fallback
  return window.confirm(`Enviar para Programação?\n\nPedido: ${pedido}\nOV: ${ov}`);
}

// ===============================
// Comercial
// ===============================
export async function initComercial() {
  const kpiRow = qs("#kpiRowComercial");
  const tbody = qs("#tbody");
  const busca = qs("#busca");
  const btnNovo = qs("#btnNovo");
  const btnExportar = qs("#btnExportar");

  const modalEl = document.getElementById("modalForm");
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;

  const form = qs("#form");
  const btnSalvar = qs("#btnSalvar");

  const comercialPedidoKey = qs("#comercialPedidoKey");
  const comercialPedidoOv = qs("#comercialPedidoOv");

  let cacheItems = [];
  let editingId = null;

  // Auxiliares (mantém para o modal)
  const aux = await apiGet("/api/auxiliares");
  fillSelect(form?.querySelector("[name=cif_fob]"), aux.cif_fob || []);
  fillSelect(form?.querySelector("[name=produto]"), aux.produtos || []);
  fillSelect(form?.querySelector("[name=uf_entrega]"), aux.ufs || []);
  fillSelect(form?.querySelector("[name=assessor]"), aux.assessores || []);
  fillSelect(form?.querySelector("[name=assistente]"), aux.assistentes || []);

  async function load() {
    const q = (busca?.value || "").trim();
    const url = `/api/pedidos?stage=comercial${q ? `&busca=${encodeURIComponent(q)}` : ""}`;
    const data = await apiGet(url);
    const items = data.items || [];
    cacheItems = items;

    const total = items.length;
    const semOV = items.filter(p => !safeText(p.ov_remessa).trim()).length;
    const semCliente = items.filter(p => !safeText(p.cliente).trim()).length;
    const semProduto = items.filter(p => !safeText(p.produto).trim()).length;

    if (kpiRow) {
      kpiRow.innerHTML = [
        buildKpiCard({ label: "PEDIDOS EM COMERCIAL", value: total, iconType: "db", iconBg: "#eef2ff", iconColor: "#3730a3" }),
        buildKpiCard({ label: "SEM OV/REMESSA", value: semOV, iconType: "edit", iconBg: "#fff7ed", iconColor: "#9a3412" }),
        buildKpiCard({ label: "SEM CLIENTE", value: semCliente, iconType: "user", iconBg: "#f3e8ff", iconColor: "#7c3aed" }),
        buildKpiCard({ label: "SEM PRODUTO", value: semProduto, iconType: "box", iconBg: "#ecfdf5", iconColor: "#16a34a" }),
      ].join("");
    }

    tbody.innerHTML = items.map(p => {
      const cliente = safeText(p.cliente) || "-";
      const produto = safeText(p.produto) || "-";

      return `
        <tr>
          <td><span class="status-pill ${statusPillClass()}">${statusLabel()}</span></td>
          <td class="text-muted small nowrap-ellipsis" title="${safeText(p.data)}">${safeText(p.data) || "-"}</td>
          <td class="font-monospace nowrap-ellipsis" title="${safeText(p.ov_remessa)}">${safeText(p.ov_remessa) || "-"}</td>

          <td class="td-cliente">
            <div class="cell-wrap nowrap-ellipsis" title="${cliente}">${cliente}</div>
          </td>

          <td class="td-produto">
            <div class="cell-wrap nowrap-ellipsis" title="${produto}">${produto}</div>
          </td>

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

  function openNew() {
    editingId = null;
    form?.reset();

    const idInput = form?.querySelector("[name=id]");
    if (idInput) idInput.value = "";

    if (comercialPedidoKey) comercialPedidoKey.textContent = "Pedido: (novo)";
    if (comercialPedidoOv) comercialPedidoOv.textContent = "OV: -";

    modal?.show();
  }

  async function openEdit(id) {
    editingId = id;

    const data = await apiGet(`/api/pedidos/${id}`);
    const item = data.item;

    if (item?.status && item.status !== "comercial") {
      alert("Este pedido não está na etapa Comercial e não pode ser editado aqui.");
      return;
    }

    form?.reset();
    setFormValues(form, item);

    const chave = safeText(item.chave || item.id || "-");
    const ov = safeText(item.ov_remessa || "-");
    if (comercialPedidoKey) comercialPedidoKey.textContent = `Pedido: ${chave}`;
    if (comercialPedidoOv) comercialPedidoOv.textContent = `OV: ${ov}`;

    modal?.show();
  }

  async function save() {
    const v = getFormValues(form);

    const id = v.id ? Number(v.id) : (editingId ? Number(editingId) : null);
    delete v.id;

    if (v.qtde_solicitada !== undefined && v.qtde_solicitada !== "") {
      v.qtde_solicitada = Number(v.qtde_solicitada);
    }

    // Atualiza apenas campos do comercial + status comercial
    const payload = {
      status: "comercial",
      data: v.data,
      ov_remessa: v.ov_remessa,
      cif_fob: v.cif_fob,
      cliente: v.cliente,
      produto: v.produto,
      local_entrega: v.local_entrega,
      uf_entrega: v.uf_entrega,
      qtde_solicitada: v.qtde_solicitada,
      assessor: v.assessor,
      assistente: v.assistente,
    };

    if (!id) await apiPost("/api/pedidos", payload);
    else await apiPut(`/api/pedidos/${id}`, payload);

    modal?.hide();
    await load();
  }

  async function enviarProximaFila(id) {
    let item = null;
    try {
      const data = await apiGet(`/api/pedidos/${id}`);
      item = data.item;
    } catch (_) {}

    if (item?.status && item.status !== "comercial") {
      alert("Este pedido não está na etapa Comercial e não pode ser enviado por aqui.");
      return;
    }

    const pedido = safeText(item?.chave || id);
    const ov = safeText(item?.ov_remessa || "-");

    const ok = await confirmEnviar({ pedido, ov });
    if (!ok) return;

    await apiPut(`/api/pedidos/${id}`, { status: "programacao" });
    await load();
  }

  // Eventos
  btnNovo?.addEventListener("click", openNew);
  btnSalvar?.addEventListener("click", () => save().catch(e => alert(e.message)));

  btnExportar?.addEventListener("click", () => {
    const csv = toCSV(cacheItems);
    download(`comercial_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
  });

  let t = null;
  busca?.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => load().catch(e => alert(e.message)), 250);
  });

  load().catch(e => alert(e.message));
}
