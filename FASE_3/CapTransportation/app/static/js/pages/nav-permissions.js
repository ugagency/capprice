// app/static/js/nav-permissions.js
// ===============================
// Oculta itens do menu lateral com base em permissões vindas do backend (window.__BOOT__.permissions)
// Regras:
// - Se permissions.master === true -> mostra tudo
// - Caso contrário, mostra apenas links com data-perm === true
// ===============================

(function () {
  function getPerms() {
    const p = window.__BOOT__?.permissions;
    return (p && typeof p === "object") ? p : {};
  }

  function canAccess(key, perms) {
    if (!key) return true;
    if (perms.master === true) return true;
    return perms[key] === true;
  }

  function hideLink(el) {
    if (!el) return;
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
    el.tabIndex = -1;
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const perms = getPerms();

    // Todos os links que controlamos por permissão usam data-perm
    document.querySelectorAll("[data-perm]").forEach((el) => {
      const key = el.getAttribute("data-perm");
      if (!canAccess(key, perms)) hideLink(el);
    });
  });
})();
