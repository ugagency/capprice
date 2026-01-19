// app/static/js/pages/admin_perms_app.js

export function initAdminPermsAppTab() {
  const appSelect = document.getElementById("permAppSelect");
  if (!appSelect) return;

  // Tabs
  document.getElementById("permTabPerms")?.addEventListener("click", () => {
    showPanel("permPanelPerms");
    loadModulesList(appSelect.value);
  });

  document.getElementById("permTabUsers")?.addEventListener("click", () => {
    showPanel("permPanelUsers");
    loadUsersList(appSelect.value);
  });

  // change app
  appSelect.addEventListener("change", () => {
    const isUsers = !document.getElementById("permPanelUsers")?.classList.contains("hidden");
    resetEditor();
    if (isUsers) loadUsersList(appSelect.value);
    else loadModulesList(appSelect.value);
  });

  // busca usuários
  document.getElementById("permUserSearchUsers")?.addEventListener("input", () => {
    loadUsersList(appSelect.value);
  });

  // atualizar lista usuários
  document.getElementById("btnReloadPermUsers")?.addEventListener("click", () => {
    loadUsersList(appSelect.value);
  });

  // marcar tudo / limpar
  document.getElementById("btnSelectAllPerms")?.addEventListener("click", () => {
    document.querySelectorAll("#permGrid input.perm-switch").forEach((i) => (i.checked = true));
    enableSave(true);
  });

  document.getElementById("btnClearAllPerms")?.addEventListener("click", () => {
    document.querySelectorAll("#permGrid input.perm-switch").forEach((i) => (i.checked = false));
    enableSave(true);
  });

  // filtro do grid
  document.getElementById("permSearchPerms")?.addEventListener("input", () => {
    filterPermGrid();
  });

  // Inicial
  showPanel("permPanelPerms");
  loadModulesList(appSelect.value);
}

function showPanel(id) {
  document.getElementById("permPanelPerms")?.classList.add("hidden");
  document.getElementById("permPanelUsers")?.classList.add("hidden");
  document.getElementById(id)?.classList.remove("hidden");
}

function setError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!msg) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("hidden");
}

function resetEditor() {
  document.getElementById("permEditorBox")?.classList.add("hidden");
  document.getElementById("permEditorUserLabel") && (document.getElementById("permEditorUserLabel").textContent = "-");
  const grid = document.getElementById("permGrid");
  if (grid) grid.innerHTML = "";
  const search = document.getElementById("permSearchPerms");
  if (search) search.value = "";
  setError("permUserError", "");
  enableSave(false);
}

function enableSave(on) {
  const btn = document.getElementById("btnSaveUserPerms");
  if (btn) btn.disabled = !on;
}

async function apiJson(url, options) {
  const res = await fetch(url, options);
  const txt = await res.text();

  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = null; }

  if (!res.ok) {
    const msg = data?.error || data?.message || txt || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ===============================
// Aba Permissões (lista módulos)
// ===============================
async function loadModulesList(clientId) {
  const tbody = document.getElementById("adminPermTbody");
  const empty = document.getElementById("adminPermEmpty");
  setError("adminPermError", "");

  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="3" class="px-4 py-4 text-sm text-gray-500">Carregando...</td></tr>`;
  empty?.classList.add("hidden");

  try {
    const data = await apiJson(`/api/admin/apps/${clientId}/modules`);
    if (!Array.isArray(data)) throw new Error("Formato inválido ao listar módulos.");

    if (!data.length) {
      tbody.innerHTML = "";
      empty?.classList.remove("hidden");
      return;
    }

    tbody.innerHTML = data
      .map(
        (m) => `
      <tr class="border-b text-xs hover:bg-gray-50">
        <td class="px-4 py-2 font-mono">${escapeHtml(m.key)}</td>
        <td class="px-4 py-2 font-bold">${escapeHtml(m.label)}</td>
        <td class="px-4 py-2">${m.enabled ? "✅" : "❌"}</td>
      </tr>`
      )
      .join("");
  } catch (e) {
    tbody.innerHTML = "";
    empty?.classList.add("hidden");
    setError("adminPermError", `Erro ao carregar módulos: ${e.message}`);
  }
}

// ===============================
// Aba Acesso por Usuário
// ===============================
async function loadUsersList(clientId) {
  const tbody = document.getElementById("permUsersTbody");
  const empty = document.getElementById("permUsersEmpty");
  setError("permUsersError", "");

  if (!tbody) return;

  const busca = (document.getElementById("permUserSearchUsers")?.value || "").trim();

  tbody.innerHTML = `<tr><td colspan="3" class="px-4 py-4 text-sm text-gray-500">Carregando...</td></tr>`;
  empty?.classList.add("hidden");
  resetEditor();

  try {
    const qs = new URLSearchParams();
    if (busca) qs.set("busca", busca);
    qs.set("limit", "200");

    const data = await apiJson(`/api/admin/apps/${clientId}/users?${qs.toString()}`);
    const items = Array.isArray(data?.items) ? data.items : [];

    if (!items.length) {
      tbody.innerHTML = "";
      empty?.classList.remove("hidden");
      return;
    }

    tbody.innerHTML = items
      .map(
        (u) => `
      <tr class="hover:bg-gray-50 border-b">
        <td class="px-4 py-3 text-sm font-bold">${escapeHtml(u.email || "-")}</td>
        <td class="px-4 py-3 text-sm">${escapeHtml(u.name || "-")}</td>
        <td class="px-4 py-3 text-right">
          <button
            class="text-teal-600 text-xs font-extrabold hover:underline"
            data-user-id="${escapeAttr(u.id)}"
            data-user-name="${escapeAttr(u.name || u.email || "Usuário")}"
            type="button">
            VINCULAR
          </button>
        </td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("button[data-user-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const userId = btn.getAttribute("data-user-id");
        const userName = btn.getAttribute("data-user-name") || "Usuário";
        await openEditor(clientId, userId, userName);
      });
    });
  } catch (e) {
    tbody.innerHTML = "";
    empty?.classList.add("hidden");
    setError("permUsersError", `Erro ao carregar usuários: ${e.message}`);
  }
}

// ===============================
// Editor de permissões do usuário
// ===============================
let currentEdit = { clientId: null, userId: null };

async function openEditor(clientId, userId, userName) {
  const editor = document.getElementById("permEditorBox");
  const grid = document.getElementById("permGrid");
  if (!editor || !grid) return;

  currentEdit = { clientId, userId };

  document.getElementById("permEditorUserLabel").textContent = userName;
  editor.classList.remove("hidden");
  grid.innerHTML = `<div class="text-sm text-gray-500">Carregando permissões...</div>`;
  setError("permUserError", "");
  enableSave(false);

  try {
    const data = await apiJson(`/api/admin/apps/${clientId}/users/${userId}/permissions`);

    const modules = Array.isArray(data?.modules) ? data.modules : [];
    const perms = data?.permissions && typeof data.permissions === "object" ? data.permissions : {};

    if (!modules.length) {
      grid.innerHTML = `<div class="text-xs text-red-600 font-bold">Nenhum módulo habilitado encontrado para este app.</div>`;
      return;
    }

    grid.innerHTML = modules
      .map((m) => {
        const key = m.module_key;
        const label = m.module_label;
        const checked = perms[key] ? "checked" : "";
        return `
          <label class="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-100 gap-3 perm-item"
                 data-search="${escapeAttr((key + " " + label).toLowerCase())}">
            <div class="min-w-0">
              <div class="text-xs font-extrabold text-gray-900 truncate">${escapeHtml(label)}</div>
              <div class="text-[11px] text-gray-500 font-mono truncate">${escapeHtml(key)}</div>
            </div>
            <input type="checkbox" class="perm-switch" data-key="${escapeAttr(key)}" ${checked}>
          </label>`;
      })
      .join("");

    grid.querySelectorAll("input.perm-switch").forEach((cb) => {
      cb.addEventListener("change", () => enableSave(true));
    });

    // botão salvar
    const btnSave = document.getElementById("btnSaveUserPerms");
    if (btnSave) {
      btnSave.onclick = async () => {
        await savePerms();
      };
    }

    enableSave(false); // só habilita quando houver alteração
    filterPermGrid();
  } catch (e) {
    grid.innerHTML = "";
    setError("permUserError", `Erro ao carregar permissões do usuário: ${e.message}`);
  }
}

function filterPermGrid() {
  const q = (document.getElementById("permSearchPerms")?.value || "").trim().toLowerCase();
  document.querySelectorAll("#permGrid .perm-item").forEach((el) => {
    const hay = el.getAttribute("data-search") || "";
    el.classList.toggle("hidden", q && !hay.includes(q));
  });
}

async function savePerms() {
  const { clientId, userId } = currentEdit;
  if (!clientId || !userId) return;

  setError("permUserError", "");

  try {
    const permissions = {};
    document.querySelectorAll("#permGrid input.perm-switch").forEach((i) => {
      permissions[i.dataset.key] = !!i.checked;
    });

    await apiJson(`/api/admin/apps/${clientId}/users/${userId}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions }),
    });

    enableSave(false);
  } catch (e) {
    setError("permUserError", `Erro ao salvar vínculos: ${e.message}`);
    enableSave(true);
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll("`", "&#096;");
}
