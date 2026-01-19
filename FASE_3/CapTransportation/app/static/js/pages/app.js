// app/static/js/app.js

const perms = window.__BOOT__?.permissions || {};

const statusLabel = {
  comercial: { label: "Comercial", cls: "text-bg-primary" },
  programacao: { label: "Programado", cls: "text-bg-warning" },
  industrial: { label: "Industrial", cls: "text-bg-secondary" },
  laboratorio: { label: "Laboratório", cls: "text-bg-info" },
  faturamento: { label: "Faturamento", cls: "text-bg-success" },
  finalizado: { label: "Finalizado", cls: "text-bg-dark" },
};

function canAccess(tab) {
  return !!(perms.master || perms[tab]);
}
function qs(sel) { return document.querySelector(sel); }

async function apiGet(url) {
  const r = await fetch(url, { headers: { "Accept": "application/json" }});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

async function apiPost(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

function safeText(v) {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(safeText).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const pick =
      v.nome ?? v.name ?? v.descricao ?? v.label ?? v.value ??
      v.id ?? v.chave ?? "";
    if (typeof pick === "object") {
      try { return JSON.stringify(pick); } catch { return ""; }
    }
    return String(pick ?? "");
  }
  return String(v);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeHtml(v) {
  return escapeHtml(safeText(v));
}

function renderKpis(items) {
  const cardsRow = qs("#cardsRow");
  if (!cardsRow) return;

  const total = items.length;
  const industrial = items.filter(x => x.status === "industrial").length;
  const lab = items.filter(x => x.status === "laboratorio").length;
  const fat = items.filter(x => x.status === "faturamento").length;

  const kpis = [
    { title: "Total", value: total },
    { title: "Industrial", value: industrial },
    { title: "Laboratório", value: lab },
    { title: "Faturamento", value: fat },
  ];

  cardsRow.innerHTML = kpis.map(k => `
    <div class="col-12 col-md-3">
      <div class="card kpi-card">
        <div class="card-body">
          <div class="text-muted small fw-bold">${safeHtml(k.title)}</div>
          <div class="fs-3 fw-bold">${safeHtml(k.value)}</div>
        </div>
      </div>
    </div>
  `).join("");
}

function renderTable(items) {
  const tb = qs("#tbodyPedidos");
  if (!tb) return;

  tb.innerHTML = items.map(p => {
    const cfg = statusLabel[p.status] || { label: p.status, cls: "text-bg-light" };
    const canAdvance = (p.status !== "finalizado") && canAccess(p.status);

    const cliente = safeText(p.cliente) || "-";
    const produto = safeText(p.produto) || "-";
    const ov = safeText(p.ov) || safeText(p.ov_remessa) || "-";

    return `
      <tr>
        <td><span class="badge ${cfg.cls} badge-status">${safeHtml(cfg.label)}</span></td>
        <td class="fw-semibold">${safeHtml(cliente)}</td>
        <td class="text-muted">${safeHtml(produto)}</td>
        <td class="font-monospace">${safeHtml(ov)}</td>
        <td>
          <div class="progress" role="progressbar" aria-valuenow="${Number(p.progresso || 0)}" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-bar" style="width:${Number(p.progresso || 0)}%"></div>
          </div>
        </td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-success" data-advance="${p.id}" ${canAdvance ? "" : "disabled"}>
            Concluir etapa
          </button>
        </td>
      </tr>
    `;
  }).join("");

  tb.querySelectorAll("[data-advance]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-advance");
      btn.disabled = true;
      try {
        await apiPost(`/api/pedidos/${id}/advance`, {});
        await load();
      } catch (e) {
        alert(`Erro ao avançar: ${e.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function load() {
  if (!canAccess("mestre")) {
    qs("#tbodyPedidos").innerHTML = `<tr><td colspan="6" class="text-center text-muted py-5">
      Sem permissão para Visão Mestre.
    </td></tr>`;
    return;
  }

  const busca = (qs("#busca")?.value || "").trim();
  const url = `/api/pedidos?status=mestre${busca ? `&busca=${encodeURIComponent(busca)}` : ""}`;

  const data = await apiGet(url);
  renderKpis(data.items || []);
  renderTable(data.items || []);
}

function wireModalNovo() {
  const btnNovo = qs("#btnNovo");
  if (!btnNovo) return;

  btnNovo.disabled = !canAccess("comercial");

  const modalEl = qs("#modalNovo");
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;

  btnNovo.addEventListener("click", () => {
    if (!canAccess("comercial")) {
      alert("Sem permissão para criar pedidos (Comercial).");
      return;
    }
    modal?.show();
  });

  const btnSalvar = qs("#btnSalvarNovo");
  const form = qs("#formNovo");

  btnSalvar?.addEventListener("click", async () => {
    if (!form) return;

    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());

    if (!payload.data || !payload.cliente || !payload.produto || !payload.ov) {
      alert("Preencha os campos obrigatórios.");
      return;
    }

    btnSalvar.disabled = true;
    try {
      await apiPost("/api/pedidos", payload);
      modal?.hide();
      form.reset();
      await load();
    } catch (e) {
      alert(`Erro ao salvar: ${e.message}`);
    } finally {
      btnSalvar.disabled = false;
    }
  });
}

function wireSearch() {
  const busca = qs("#busca");
  if (!busca) return;

  let t = null;
  busca.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => load().catch(e => alert(e.message)), 250);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireModalNovo();
  wireSearch();
  load().catch(e => alert(e.message));
});
