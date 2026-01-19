// app/static/js/_shared.js

export function qs(sel) { return document.querySelector(sel); }

// ===============================
// API helpers
// ===============================
export async function apiGet(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || data.message || `HTTP ${r.status}`);
  return data;
}

export async function apiPost(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || data.message || `HTTP ${r.status}`);
  return data;
}

export async function apiPut(url, body) {
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || data.message || `HTTP ${r.status}`);
  return data;
}

// ===============================
// Text/HTML helpers (evita [object Object])
// ===============================
export function safeText(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isFinite(v.getTime()) ? v.toISOString() : "";

  if (Array.isArray(v)) {
    return v.map(safeText).filter(Boolean).join(", ");
  }

  if (typeof v === "object") {
    const pick =
      v.nome ?? v.name ?? v.descricao ?? v.label ?? v.value ??
      v.cliente ?? v.produto ??
      v.id ?? v.chave ?? "";
    if (typeof pick === "object") {
      try { return JSON.stringify(pick); } catch { return ""; }
    }
    return String(pick ?? "");
  }

  return String(v);
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeHtml(v) {
  return escapeHtml(safeText(v));
}

// ===============================
// Form helpers
// ===============================
export function fillSelect(selectEl, items, placeholder = "Selecione...") {
  if (!selectEl) return;
  selectEl.innerHTML =
    `<option value="">${placeholder}</option>` +
    (items || []).map(v => `<option value="${safeText(v)}">${safeText(v)}</option>`).join("");
}

export function setFormValues(form, obj) {
  if (!form) return;
  [...form.elements].forEach(el => {
    if (!el.name) return;
    if (obj?.[el.name] === null || obj?.[el.name] === undefined) return;
    el.value = obj[el.name];
  });
}

export function getFormValues(form) {
  const fd = new FormData(form);
  const obj = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

// ===============================
// Permissions (NORMALIZAÇÃO)
// ===============================
function normalizeKey(k) {
  if (!k) return "";
  let key = String(k).trim();
  if (key.startsWith("perm_")) key = key.slice(5);
  if (key.startsWith("perm-")) key = key.slice(5);
  return key;
}

/**
 * Regras IMPORTANTES do Cap Transportation:
 * - A permissão "master" (label Admin no seu modal) NÃO é superusuário.
 *   Ela equivale a permissão administrativa da tela "Permissões".
 * - Se você quiser superusuário, use "is_master" (se existir) OU crie "super".
 */
export function normalizePermissions(raw) {
  const out = {};
  if (!raw) return out;

  const applyKey = (k, v = true) => {
    const kk = normalizeKey(k);
    if (!kk) return;

    // MAPEAMENTO: master => permissions (Admin)
    if (kk === "master") {
      out.permissions = !!v;
      return;
    }

    out[kk] = !!v;
  };

  // array
  if (Array.isArray(raw)) {
    raw.forEach((k) => applyKey(k, true));
    return out;
  }

  // object
  if (typeof raw === "object") {
    // Se vier superusuário por is_master (caso exista no futuro)
    if (raw.is_master === true || raw.super === true || raw.superuser === true) {
      out.super = true; // super libera tudo
    }

    Object.entries(raw).forEach(([k, v]) => applyKey(k, v));
    return out;
  }

  return out;
}

export function getPerms() {
  const raw = window.__BOOT__?.permissions;
  return normalizePermissions(raw);
}

export function canAccess(key, perms = null) {
  const p = perms || getPerms();
  const k = normalizeKey(key);

  // superusuário (se existir)
  if (p.super) return true;

  if (!k) return false;
  return !!p[k];
}

export function requireAccess(key, opts = {}) {
  const {
    redirectTo = "/mestre",
    showAlert = true,
    message = "Sem permissão para acessar esta tela.",
  } = opts;

  if (canAccess(key)) return true;

  if (showAlert && window.Swal?.fire) {
    window.Swal.fire({
      icon: "warning",
      title: "Acesso restrito",
      text: message,
      confirmButtonText: "Ok",
      customClass: { confirmButton: "btn btn-primary btn-sm" },
      buttonsStyling: false,
    }).then(() => {
      window.location.href = redirectTo;
    });
  } else {
    alert(message);
    window.location.href = redirectTo;
  }

  return false;
}
