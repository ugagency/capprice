// app/static/js/pages/admin_modals.js
console.log("[admin_modals.js] carregado");

(function () {
  "use strict";

  // ===============================
  // Modal helpers (Tailwind modal)
  // ===============================
  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;

    el.classList.remove("hidden");
    el.classList.add("flex");
    document.body.style.overflow = "hidden";
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;

    el.classList.add("hidden");
    el.classList.remove("flex");

    const anyOpen = document.querySelector("[data-modal].flex");
    if (!anyOpen) document.body.style.overflow = "";
  }

  function closeAllModals() {
    document.querySelectorAll("[data-modal]").forEach((m) => {
      m.classList.add("hidden");
      m.classList.remove("flex");
    });
    document.body.style.overflow = "";
  }

  function qs(sel) {
    return document.querySelector(sel);
  }

  function getClosestModalId(el) {
    const modal = el?.closest?.("[data-modal]");
    return modal?.id || null;
  }

  // ===============================
  // Close triggers (padrões)
  // ===============================
  const CLOSE_TRIGGER_SELECTOR = [
    "[data-modal-close]",
    "[data-modal-dismiss]",
    "[data-dismiss='modal']",
    "[data-bs-dismiss='modal']",
    "[data-close]",
    "[data-action='close']",
    "[data-action='modal-close']",
    "[aria-label='Close']",
    "[aria-label='Fechar']",
    ".btn-close",
    ".modal-close",
    ".close",
  ].join(",");

  function isExplicitCloseTrigger(target) {
    if (!target || !target.closest) return false;
    return !!target.closest(CLOSE_TRIGGER_SELECTOR);
  }

  function isTextCloseButton(target) {
    const btn = target?.closest?.("button,a");
    if (!btn) return false;
    const text = (btn.textContent || "").trim().toLowerCase();
    return text === "fechar" || text.includes("fechar");
  }

  function isIconCloseButton(target) {
    const btn = target?.closest?.("button");
    if (!btn) return false;

    const hasSvg = !!btn.querySelector("svg");
    const text = (btn.textContent || "").trim();

    if (text === "✕" || text.toLowerCase() === "x" || text === "×") return true;
    if (hasSvg && text.replace(/\s+/g, "").length === 0) return true;

    return false;
  }

  function tryCloseFromTarget(target) {
    const trigger = target?.closest?.(CLOSE_TRIGGER_SELECTOR);
    const explicitId = trigger?.getAttribute?.("data-modal-close");
    if (explicitId) {
      closeModal(explicitId);
      return true;
    }

    const parentId = getClosestModalId(trigger || target);
    if (parentId) {
      closeModal(parentId);
      return true;
    }

    closeAllModals();
    return true;
  }

  // ===============================
  // Init Admin Modals
  // ===============================
  function initAdminModals(handlers) {
    if (!handlers) return;

    const {
      // users/perms/reset já existiam
      loadUsers,
      loadRoles,
      loadPerms,
      applyUsersSearch,
      applyRolesSearch,
      applyPermsSearch,
      handleUsersActions,
      openCreateUser,
      saveUser,
      doResetFromSelect,
      showError,

      // roles (NOVO)
      handleRolesActions,
      openCreateRole,
      saveRole,
      saveRolePerms,
      applyRolePermsSearch,
    } = handlers;

    // ----------------------------------------------------
    // listener em CAPTURE
    // ----------------------------------------------------
    document.addEventListener(
      "click",
      async (e) => {
        // Fechar
        if (isExplicitCloseTrigger(e.target) || isTextCloseButton(e.target) || isIconCloseButton(e.target)) {
          e.preventDefault();
          tryCloseFromTarget(e.target);
          return;
        }

        // Clique no overlay (fora do conteúdo): fecha
        const modalRoot = e.target.closest("[data-modal].flex");
        if (modalRoot && e.target === modalRoot) {
          closeModal(modalRoot.id);
          return;
        }

        // Clique nos cards: abre modais
        const btn = e.target.closest("[data-admin-open]");
        if (!btn) return;

        const id = btn.getAttribute("data-admin-open");
        if (!id) return;

        try {
          if (id === "modalUsers") {
            openModal(id);
            await loadUsers();
            return;
          }
          if (id === "modalRoles") {
            openModal(id);
            await loadRoles();
            return;
          }
          if (id === "modalPerms") {
            openModal(id);
            await loadPerms();
            return;
          }
          if (id === "modalReset") {
            openModal(id);
            qs("#resetResult")?.classList.add("hidden");
            await loadUsers();
            return;
          }

          openModal(id);
        } catch (err) {
          openModal(id);
          if (typeof showError === "function") {
            if (id === "modalUsers") showError("adminUsersError", err.message);
            if (id === "modalRoles") showError("adminRolesError", err.message);
            if (id === "modalPerms") showError("adminPermError", err.message);
            if (id === "modalReset") showError("resetError", err.message);
          }
        }
      },
      true
    );

    // ESC fecha tudo
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllModals();
    });

    // USERS
    qs("#adminUsersSearch")?.addEventListener("input", applyUsersSearch);
    qs("#btnReloadUsers")?.addEventListener("click", loadUsers);
    qs("#adminUsersTbody")?.addEventListener("click", handleUsersActions);
    qs("#btnOpenCreateUser")?.addEventListener("click", openCreateUser);
    qs("#btnSaveUser")?.addEventListener("click", saveUser);

    // ROLES (NOVO)
    qs("#adminRolesSearch")?.addEventListener("input", applyRolesSearch);
    qs("#btnReloadRoles")?.addEventListener("click", loadRoles);
    qs("#adminRolesTbody")?.addEventListener("click", handleRolesActions);
    qs("#btnOpenCreateRole")?.addEventListener("click", openCreateRole);
    qs("#btnSaveRole")?.addEventListener("click", saveRole);

    // Role-perms (NOVO)
    qs("#btnSaveRolePerms")?.addEventListener("click", saveRolePerms);
    qs("#rolePermsSearch")?.addEventListener("input", applyRolePermsSearch);

    // PERMS
    qs("#adminPermSearch")?.addEventListener("input", applyPermsSearch);
    qs("#btnReloadPerms")?.addEventListener("click", loadPerms);

    // RESET
    qs("#btnDoReset")?.addEventListener("click", doResetFromSelect);
  }

  window.AdminModals = {
    openModal,
    closeModal,
    closeAllModals,
    initAdminModals,
  };
})();
