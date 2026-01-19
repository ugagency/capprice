// app/static/js/pages/admin.js
console.log("[admin.js] carregado");

(function () {
  "use strict";

  let cacheUsers = [];
  let cacheRoles = [];
  let cachePerms = [];

  // cache do modal de vínculo role-perms
  let rolePermsAll = [];
  let rolePermsSelected = new Set();
  let rolePermsRoleId = null;
  let rolePermsRoleLabel = "";

  function qs(sel) {
    return document.querySelector(sel);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return (str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ===============================
  // Modal bridge (Tailwind modal helper)
  // ===============================
  function getModalBridge() {
    const bridge = window.AdminModals || {};
    return {
      openModal: bridge.openModal || (() => {}),
      closeModal: bridge.closeModal || (() => {}),
      initAdminModals: bridge.initAdminModals || (() => {}),
    };
  }

  // ===============================
  // Safe setters
  // ===============================
  function setValue(id, value) {
    const el = byId(id);
    if (!el) return false;
    el.value = value ?? "";
    return true;
  }

  function setChecked(id, checked) {
    const el = byId(id);
    if (!el) return false;
    el.checked = !!checked;
    return true;
  }

  function setText(id, text) {
    const el = byId(id);
    if (!el) return false;
    el.textContent = text ?? "";
    return true;
  }

  function showError(id, msg) {
    const el = byId(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function hideError(id) {
    const el = byId(id);
    if (!el) return;
    el.classList.add("hidden");
    el.textContent = "";
  }

  function showBlock(id) {
    const el = byId(id);
    if (!el) return false;
    el.classList.remove("hidden");
    return true;
  }

  function hideBlock(id) {
    const el = byId(id);
    if (!el) return false;
    el.classList.add("hidden");
    return true;
  }

  // ===============================
  // Fetch helpers
  // ===============================
  async function apiGet(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Erro ${res.status}`);
    return data;
  }

  async function apiPost(url, body = {}) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Erro ${res.status}`);
    return data;
  }

  async function apiPut(url, body = {}) {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Erro ${res.status}`);
    return data;
  }

  async function apiDelete(url) {
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Erro ${res.status}`);
    return data;
  }

  // ===============================
  // Modal de senha temporária (RESET pelo card de usuários)
  // ===============================
  function ensureTempPassModalElements() {
    const required = ["modalTempPass", "tempPassValue", "btnCopyTempPass"];
    const missing = required.filter((id) => !byId(id));
    if (missing.length) {
      throw new Error(
        `Modal de senha temporária não disponível no DOM. IDs ausentes: ${missing.join(", ")}.`
      );
    }
  }

  function openTempPassModal(tempPass, userLabel) {
    const { openModal } = getModalBridge();

    ensureTempPassModalElements();

    setText("tempPassValue", tempPass || "");
    setText("tempPassUserInfo", userLabel || ""); // se existir no template

    const btnCopy = byId("btnCopyTempPass");
    btnCopy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(tempPass || "");
        const old = btnCopy.textContent;
        btnCopy.textContent = "Copiado!";
        setTimeout(() => (btnCopy.textContent = old || "Copiar"), 1200);
      } catch (e) {
        alert("Não foi possível copiar automaticamente. Copie manualmente a senha exibida.");
      }
    };

    openModal("modalTempPass");
  }

  // ===============================
  // UI helpers
  // ===============================
  function badge(htmlClass, text) {
    return `<span class="${htmlClass} px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">${text}</span>`;
  }

  // ===============================
  // Render Users
  // ===============================
  function renderUsers(list) {
    const tbody = qs("#adminUsersTbody");
    const empty = qs("#adminUsersEmpty");
    if (!tbody || !empty) return;

    tbody.innerHTML = "";
    if (!list.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    list.forEach((u) => {
      const isActive = !!u.is_active;
      const mustChange = !!u.must_change_pass;

      const status = isActive
        ? badge("bg-green-100 text-green-700", "Ativo")
        : badge("bg-gray-200 text-gray-600", "Inativo");

      const troca = mustChange
        ? badge("bg-amber-100 text-amber-800", "Pendente")
        : badge("bg-gray-100 text-gray-600", "OK");

      const tr = document.createElement("tr");
      tr.className = "hover:bg-gray-50 transition";
      tr.innerHTML = `
        <td class="px-3 py-2">
          <div class="font-bold text-gray-900">${escapeHtml(u.nome)}</div>
          <div class="text-xs text-gray-500">${escapeHtml((u.roles || []).join(", "))}</div>
        </td>
        <td class="px-3 py-2">${escapeHtml(u.email)}</td>
        <td class="px-3 py-2">${status}</td>
        <td class="px-3 py-2">${troca}</td>
        <td class="px-3 py-2 text-right space-x-2">
          <button class="text-gray-500 hover:text-teal-700 transition font-bold"
            data-user-edit="${u.user_id}" type="button">Editar</button>

          <button class="text-gray-500 hover:text-teal-700 transition font-bold"
            data-user-reset="${u.user_id}" type="button"
            data-user-email="${escapeHtml(u.email)}"
            data-user-name="${escapeHtml(u.nome)}">Reset</button>

          <button class="text-gray-500 hover:text-red-600 transition font-bold"
            data-user-toggle="${u.user_id}" type="button">
            ${isActive ? "Inativar" : "Ativar"}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ===============================
  // Render Roles (Níveis)
  // ===============================
  function renderRoles(list) {
    const tbody = qs("#adminRolesTbody");
    if (!tbody) return;

    tbody.innerHTML = "";
    (list || []).forEach((r) => {
      const isActive = r.is_active !== false;
      const status = isActive
        ? badge("bg-green-100 text-green-700", "Ativo")
        : badge("bg-gray-200 text-gray-600", "Inativo");

      const tr = document.createElement("tr");
      tr.className = "hover:bg-gray-50 transition";
      tr.innerHTML = `
        <td class="px-3 py-2 font-bold text-gray-900">${escapeHtml(r.code)}</td>
        <td class="px-3 py-2 text-gray-700">${escapeHtml(r.descricao)}</td>
        <td class="px-3 py-2">${status}</td>
        <td class="px-3 py-2 text-right space-x-2">
          <button class="text-gray-500 hover:text-teal-700 transition font-bold"
            data-role-perms="${r.role_id}"
            data-role-code="${escapeHtml(r.code)}"
            data-role-desc="${escapeHtml(r.descricao)}"
            type="button">Permissões</button>

          <button class="text-gray-500 hover:text-teal-700 transition font-bold"
            data-role-edit="${r.role_id}"
            data-role-code="${escapeHtml(r.code)}"
            data-role-desc="${escapeHtml(r.descricao)}"
            data-role-active="${isActive ? "1" : "0"}"
            type="button">Editar</button>

          <button class="text-gray-500 hover:text-red-600 transition font-bold"
            data-role-toggle="${r.role_id}"
            type="button">${isActive ? "Inativar" : "Ativar"}</button>

          <button
            class="text-red-600 hover:text-red-800 transition font-bold"
            data-role-delete="${r.role_id}"
            data-role-code="${escapeHtml(r.code)}"
            type="button">
            Excluir
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ===============================
  // ✅ Render Permissões (MODAL PERMS)
  // ===============================
  function renderPerms(list) {
    const tbody = qs("#adminPermTbody");
    const empty = qs("#adminPermEmpty");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!list || !list.length) {
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");

    list.forEach((p) => {
      const isActive = p.is_active !== false; // backend retorna true por compatibilidade
      const status = isActive
        ? badge("bg-green-100 text-green-700", "Ativo")
        : badge("bg-gray-200 text-gray-600", "Inativo");

      const tr = document.createElement("tr");
      tr.className = "hover:bg-gray-50 transition";
      tr.innerHTML = `
        <td class="px-4 py-2.5 font-extrabold text-gray-900">${escapeHtml(p.code)}</td>
        <td class="px-4 py-2.5 text-gray-700">${escapeHtml(p.descricao)}</td>
        <td class="px-4 py-2.5">${status}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function applyPermsSearch() {
    const q = (qs("#adminPermSearch")?.value || "").trim().toLowerCase();

    if (!q) {
      renderPerms(cachePerms);
      return;
    }

    const filtered = (cachePerms || []).filter((p) => {
      return (
        (p.code || "").toLowerCase().includes(q) ||
        (p.descricao || "").toLowerCase().includes(q)
      );
    });

    renderPerms(filtered);
  }

  // ===============================
  // Loaders
  // ===============================
  async function loadUsers() {
    hideError("adminUsersError");
    const data = await apiGet("/api/admin/users");
    cacheUsers = data.users || [];
    applyUsersSearch();
    fillResetSelect();
  }

  function applyUsersSearch() {
    const q = (qs("#adminUsersSearch")?.value || "").trim().toLowerCase();
    if (!q) return renderUsers(cacheUsers);

    renderUsers(
      cacheUsers.filter(
        (u) =>
          (u.nome || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q)
      )
    );
  }

  async function loadRoles() {
    hideError("adminRolesError");
    const data = await apiGet("/api/admin/roles");
    cacheRoles = data.roles || [];
    applyRolesSearch();
  }

  function applyRolesSearch() {
    const q = (qs("#adminRolesSearch")?.value || "").trim().toLowerCase();
    if (!q) return renderRoles(cacheRoles);

    renderRoles(
      cacheRoles.filter(
        (r) =>
          (r.code || "").toLowerCase().includes(q) ||
          (r.descricao || "").toLowerCase().includes(q)
      )
    );
  }

  // ✅ Agora o loadPerms também renderiza
  async function loadPerms() {
    hideError("adminPermError");
    const data = await apiGet("/api/admin/permissions");
    cachePerms = data.permissions || [];
    applyPermsSearch();
  }

  // ===============================
  // Reset select (modal reset)
  // ===============================
  function fillResetSelect() {
    const sel = qs("#resetUserSelect");
    if (!sel) return;

    sel.innerHTML = "";
    cacheUsers.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u.user_id;
      opt.textContent = `${u.nome} (${u.email})`;
      sel.appendChild(opt);
    });
  }

  async function doResetFromSelect() {
    hideError("resetError");
    const sel = qs("#resetUserSelect");
    const out = qs("#resetResult");
    const passEl = qs("#resetTempPass");
    const btn = qs("#btnDoReset");

    if (!sel || !sel.value) return;

    btn.disabled = true;
    try {
      const data = await apiPost(`/api/admin/users/${sel.value}/reset-password`);
      if (passEl) passEl.textContent = data.temp_password || "";
      if (out) out.classList.remove("hidden");
      await loadUsers();
    } catch (err) {
      showError("resetError", err.message);
    } finally {
      btn.disabled = false;
    }
  }

  // ===============================
  // User form modal (create/edit)
  // ===============================
  function requireUserFormElements() {
    const required = [
      "modalUserForm",
      "userFormTitle",
      "userFormSubtitle",
      "userFormUserId",
      "userFormNome",
      "userFormEmail",
      "userFormRole",
      "userFormActive",
      "userFormTempWrap",
      "userFormTempPass",
      "userFormError",
      "btnSaveUser",
    ];
    const missing = required.filter((id) => !byId(id));
    if (missing.length) {
      throw new Error(
        `Modal de formulário não disponível no DOM. IDs ausentes: ${missing.join(", ")}.`
      );
    }
  }

  async function ensureRolesLoaded() {
    if (cacheRoles.length) return;
    const data = await apiGet("/api/admin/roles");
    cacheRoles = data.roles || [];
  }

  function fillUserFormRoles(selectedCode) {
    const sel = byId("userFormRole");
    if (!sel) return;

    sel.innerHTML = "";
    cacheRoles
      .filter((r) => r.is_active !== false)
      .forEach((r) => {
        const opt = document.createElement("option");
        opt.value = r.code;
        opt.textContent = `${r.code} - ${r.descricao}`;
        if ((selectedCode || "").toUpperCase() === (r.code || "").toUpperCase()) {
          opt.selected = true;
        }
        sel.appendChild(opt);
      });
  }

  function resetUserFormUI() {
    requireUserFormElements();
    hideError("userFormError");

    setValue("userFormUserId", "");
    setValue("userFormNome", "");
    setValue("userFormEmail", "");
    setChecked("userFormActive", true);

    hideBlock("userFormTempWrap");
    setText("userFormTempPass", "");
  }

  async function openCreateUser() {
    const { openModal } = getModalBridge();

    try {
      resetUserFormUI();
      setText("userFormTitle", "Novo usuário");
      setText("userFormSubtitle", "Preencha os dados do usuário.");

      await ensureRolesLoaded();
      fillUserFormRoles("USER");

      openModal("modalUserForm");
    } catch (err) {
      showError("adminUsersError", err.message);
    }
  }

  async function openEditUser(userId) {
    const { openModal } = getModalBridge();

    try {
      resetUserFormUI();
      setText("userFormTitle", "Editar usuário");
      setText("userFormSubtitle", "Atualize os dados do usuário.");

      await ensureRolesLoaded();

      const data = await apiGet(`/api/admin/users/${userId}`);
      const u = data.user;
      if (!u) throw new Error("Usuário não encontrado");

      setValue("userFormUserId", u.user_id);
      setValue("userFormNome", u.nome || "");
      setValue("userFormEmail", u.email || "");
      setChecked("userFormActive", !!u.is_active);

      const roleCode = u.roles && u.roles.length ? u.roles[0] : "USER";
      fillUserFormRoles(roleCode);

      openModal("modalUserForm");
    } catch (err) {
      showError("adminUsersError", err.message);
    }
  }

  async function saveUser() {
    const { closeModal } = getModalBridge();

    try {
      requireUserFormElements();
      hideError("userFormError");

      const btn = byId("btnSaveUser");
      const userId = byId("userFormUserId").value;
      const nome = (byId("userFormNome").value || "").trim();
      const email = (byId("userFormEmail").value || "").trim();
      const role_code = byId("userFormRole").value;
      const is_active = !!byId("userFormActive").checked;

      if (!nome || !email) {
        showError("userFormError", "Informe nome e e-mail.");
        return;
      }

      btn.disabled = true;

      if (!userId) {
        await apiPost("/api/admin/users", { nome, email, role_code, is_active });
        await loadUsers();
        closeModal("modalUserForm");
        return;
      }

      await apiPut(`/api/admin/users/${userId}`, { nome, email, role_code, is_active });

      closeModal("modalUserForm");
      await loadUsers();
    } catch (err) {
      showError("userFormError", err.message);
    } finally {
      const btn = byId("btnSaveUser");
      if (btn) btn.disabled = false;
    }
  }

  async function handleUsersActions(e) {
    const btnEdit = e.target.closest("[data-user-edit]");
    const btnToggle = e.target.closest("[data-user-toggle]");
    const btnReset = e.target.closest("[data-user-reset]");

    if (!btnEdit && !btnToggle && !btnReset) return;

    hideError("adminUsersError");

    try {
      if (btnEdit) {
        const userId = btnEdit.getAttribute("data-user-edit");
        await openEditUser(userId);
        return;
      }

      if (btnToggle) {
        const userId = btnToggle.getAttribute("data-user-toggle");
        btnToggle.disabled = true;
        await apiPost(`/api/admin/users/${userId}/toggle-active`);
        await loadUsers();
        return;
      }

      if (btnReset) {
        const userId = btnReset.getAttribute("data-user-reset");
        const nome = btnReset.getAttribute("data-user-name") || "";
        const email = btnReset.getAttribute("data-user-email") || "";

        btnReset.disabled = true;

        const data = await apiPost(`/api/admin/users/${userId}/reset-password`);

        const label = nome || email ? `Usuário: ${nome}${email ? ` (${email})` : ""}` : "";
        openTempPassModal(data.temp_password, label);

        await loadUsers();
        return;
      }
    } catch (err) {
      showError("adminUsersError", err.message);
    } finally {
      if (btnToggle) btnToggle.disabled = false;
      if (btnReset) btnReset.disabled = false;
    }
  }

  // ===============================
  // ROLES (NÍVEIS) - CREATE/EDIT/TOGGLE/DELETE
  // ===============================
  function requireRoleFormElements() {
    const required = [
      "modalRoleForm",
      "roleFormTitle",
      "roleFormSubtitle",
      "roleFormRoleId",
      "roleFormCode",
      "roleFormDesc",
      "roleFormActive",
      "roleFormError",
      "btnSaveRole",
    ];
    const missing = required.filter((id) => !byId(id));
    if (missing.length) {
      throw new Error(
        `Modal de nível não disponível no DOM. IDs ausentes: ${missing.join(", ")}.`
      );
    }
  }

  function resetRoleFormUI() {
    requireRoleFormElements();
    hideError("roleFormError");
    setValue("roleFormRoleId", "");
    setValue("roleFormCode", "");
    setValue("roleFormDesc", "");
    setChecked("roleFormActive", true);
  }

  async function openCreateRole() {
    const { openModal } = getModalBridge();
    try {
      resetRoleFormUI();
      setText("roleFormTitle", "Novo nível");
      setText("roleFormSubtitle", "Preencha os dados do nível.");
      openModal("modalRoleForm");
    } catch (err) {
      showError("adminRolesError", err.message);
    }
  }

  async function openEditRoleFromBtn(btn) {
    const { openModal } = getModalBridge();
    try {
      resetRoleFormUI();
      setText("roleFormTitle", "Editar nível");
      setText("roleFormSubtitle", "Atualize os dados do nível.");

      const roleId = btn.getAttribute("data-role-edit");
      const code = btn.getAttribute("data-role-code") || "";
      const desc = btn.getAttribute("data-role-desc") || "";
      const active = btn.getAttribute("data-role-active") === "1";

      setValue("roleFormRoleId", roleId);
      setValue("roleFormCode", code);
      setValue("roleFormDesc", desc);
      setChecked("roleFormActive", active);

      openModal("modalRoleForm");
    } catch (err) {
      showError("adminRolesError", err.message);
    }
  }

  async function saveRole() {
    const { closeModal } = getModalBridge();
    try {
      requireRoleFormElements();
      hideError("roleFormError");

      const btn = byId("btnSaveRole");
      const roleId = (byId("roleFormRoleId").value || "").trim();
      const code = (byId("roleFormCode").value || "").trim();
      const descricao = (byId("roleFormDesc").value || "").trim();
      const is_active = !!byId("roleFormActive").checked;

      if (!code || !descricao) {
        showError("roleFormError", "Informe código e descrição.");
        return;
      }

      btn.disabled = true;

      if (!roleId) {
        await apiPost("/api/admin/roles", { code, descricao, is_active });
      } else {
        await apiPut(`/api/admin/roles/${roleId}`, { code, descricao, is_active });
      }

      closeModal("modalRoleForm");
      await loadRoles();
    } catch (err) {
      showError("roleFormError", err.message);
    } finally {
      const btn = byId("btnSaveRole");
      if (btn) btn.disabled = false;
    }
  }

  async function toggleRole(roleId, btnEl) {
    hideError("adminRolesError");
    try {
      if (btnEl) btnEl.disabled = true;
      await apiPost(`/api/admin/roles/${roleId}/toggle-active`);
      await loadRoles();
    } catch (err) {
      showError("adminRolesError", err.message);
    } finally {
      if (btnEl) btnEl.disabled = false;
    }
  }

  async function deleteRole(roleId, roleCode, btnEl) {
    hideError("adminRolesError");

    const label = roleCode ? ` (${roleCode})` : "";
    const ok = confirm(`Tem certeza que deseja excluir este nível${label}? Esta ação não pode ser desfeita.`);
    if (!ok) return;

    try {
      if (btnEl) btnEl.disabled = true;
      await apiDelete(`/api/admin/roles/${roleId}`);
      await loadRoles();
    } catch (err) {
      showError("adminRolesError", err.message);
    } finally {
      if (btnEl) btnEl.disabled = false;
    }
  }

  // ===============================
  // ROLES -> PERMISSIONS (VINCULAR)
  // ===============================
  function requireRolePermsElements() {
    const required = [
      "modalRolePerms",
      "rolePermsSubtitle",
      "rolePermsRoleId",
      "rolePermsSearch",
      "rolePermsList",
      "rolePermsError",
      "btnSaveRolePerms",
    ];
    const missing = required.filter((id) => !byId(id));
    if (missing.length) {
      throw new Error(
        `Modal de permissões do nível não disponível no DOM. IDs ausentes: ${missing.join(", ")}.`
      );
    }
  }

  function renderRolePermsList() {
    const wrap = byId("rolePermsList");
    if (!wrap) return;

    const q = (byId("rolePermsSearch")?.value || "").trim().toLowerCase();

    const filtered = (rolePermsAll || []).filter((p) => {
      if (!q) return true;
      return (
        (p.code || "").toLowerCase().includes(q) ||
        (p.descricao || "").toLowerCase().includes(q)
      );
    });

    wrap.innerHTML = "";

    if (!filtered.length) {
      wrap.innerHTML = `<div class="p-3 text-sm text-gray-500 font-semibold">Nenhuma permissão encontrada.</div>`;
      return;
    }

    filtered.forEach((p) => {
      const checked = rolePermsSelected.has(p.perm_id);

      const row = document.createElement("label");
      row.className = "flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer";
      row.innerHTML = `
        <input type="checkbox" class="mt-1 w-4 h-4"
          data-perm-id="${escapeHtml(p.perm_id)}" ${checked ? "checked" : ""} />
        <div class="min-w-0">
          <div class="text-sm font-extrabold text-gray-900">${escapeHtml(p.code)}</div>
          <div class="text-xs text-gray-500 leading-snug">${escapeHtml(p.descricao)}</div>
        </div>
      `;

      row.querySelector("input").addEventListener("change", (e) => {
        const id = e.target.getAttribute("data-perm-id");
        if (!id) return;
        if (e.target.checked) rolePermsSelected.add(id);
        else rolePermsSelected.delete(id);
      });

      wrap.appendChild(row);
    });
  }

  async function openRolePermsFromBtn(btn) {
    const { openModal } = getModalBridge();
    try {
      requireRolePermsElements();
      hideError("rolePermsError");

      if (!cachePerms.length) await loadPerms();

      rolePermsAll = cachePerms.map((p) => ({
        perm_id: p.perm_id,
        code: p.code,
        descricao: p.descricao,
      }));

      rolePermsRoleId = btn.getAttribute("data-role-perms");
      const code = btn.getAttribute("data-role-code") || "";
      const desc = btn.getAttribute("data-role-desc") || "";
      rolePermsRoleLabel = `${code}${desc ? ` - ${desc}` : ""}`;

      setValue("rolePermsRoleId", rolePermsRoleId);
      setText("rolePermsSubtitle", `Selecione as permissões do nível: ${rolePermsRoleLabel}`);

      const data = await apiGet(`/api/admin/roles/${rolePermsRoleId}/permissions`);
      rolePermsSelected = new Set((data.perm_ids || []).map(String));

      setValue("rolePermsSearch", "");
      renderRolePermsList();

      openModal("modalRolePerms");
    } catch (err) {
      showError("adminRolesError", err.message);
    }
  }

  function applyRolePermsSearch() {
    try {
      renderRolePermsList();
    } catch (err) {
      showError("rolePermsError", err.message);
    }
  }

  async function saveRolePerms() {
    try {
      requireRolePermsElements();
      hideError("rolePermsError");

      const btn = byId("btnSaveRolePerms");
      const roleId = (byId("rolePermsRoleId").value || "").trim();
      if (!roleId) {
        showError("rolePermsError", "role_id inválido.");
        return;
      }

      btn.disabled = true;

      await apiPut(`/api/admin/roles/${roleId}/permissions`, {
        perm_ids: Array.from(rolePermsSelected),
      });

      await loadRoles();

      const { closeModal } = getModalBridge();
      closeModal("modalRolePerms");
    } catch (err) {
      showError("rolePermsError", err.message);
    } finally {
      const btn = byId("btnSaveRolePerms");
      if (btn) btn.disabled = false;
    }
  }

  async function handleRolesActions(e) {
    const btnEdit = e.target.closest("[data-role-edit]");
    const btnToggle = e.target.closest("[data-role-toggle]");
    const btnPerms = e.target.closest("[data-role-perms]");
    const btnDelete = e.target.closest("[data-role-delete]");

    if (!btnEdit && !btnToggle && !btnPerms && !btnDelete) return;

    try {
      if (btnPerms) {
        await openRolePermsFromBtn(btnPerms);
        return;
      }
      if (btnEdit) {
        await openEditRoleFromBtn(btnEdit);
        return;
      }
      if (btnToggle) {
        const roleId = btnToggle.getAttribute("data-role-toggle");
        await toggleRole(roleId, btnToggle);
        return;
      }
      if (btnDelete) {
        const roleId = btnDelete.getAttribute("data-role-delete");
        const roleCode = btnDelete.getAttribute("data-role-code") || "";
        await deleteRole(roleId, roleCode, btnDelete);
        return;
      }
    } catch (err) {
      showError("adminRolesError", err.message);
    }
  }

// ===============================
// Back to plataformas
// ===============================
function goToPlataformas() {
  window.location.replace("/plataformas");
}

function bindBackToPlatforms() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(
      "#btnBackToPlatforms, [data-go='plataformas'], [data-action='back-platforms']"
    );

    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();
    goToPlataformas();
  });
}

  // ===============================
  // INIT
  // ===============================
  function init() {
    const { initAdminModals } = getModalBridge();

    // ✅ ativa botão "Sair e voltar para plataformas"
    bindBackToPlatforms();

    initAdminModals({
      // users
      loadUsers,
      applyUsersSearch,
      handleUsersActions,
      openCreateUser,
      saveUser,

      // roles (níveis)
      loadRoles,
      applyRolesSearch,
      handleRolesActions,
      openCreateRole,
      saveRole,

      // role-perms
      saveRolePerms,
      applyRolePermsSearch,

      // perms list
      loadPerms,
      applyPermsSearch, // ✅ agora funciona

      // reset
      doResetFromSelect,

      showError,
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body?.dataset?.page;
    if (page === "admin") {
      try {
        init();
      } catch (err) {
        console.error("[admin.js] falha ao iniciar:", err);
      }
    }
  });
})();
