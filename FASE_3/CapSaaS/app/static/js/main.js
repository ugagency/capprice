// app/static/js/main.js
const page = document.body?.dataset?.page;

async function loadPageScript(pageName) {
  if (!pageName) return;

  try {
    switch (pageName) {
      case "login": {
        const mod = await import("./pages/login.js");
        if (mod && typeof mod.init === "function") mod.init();
        break;
      }
      case "plataformas": {
        const mod = await import("./pages/plataformas.js");
        if (mod && typeof mod.init === "function") mod.init();
        break;
      }
      case "admin": {
        const mod = await import("./pages/admin.js");
        if (mod && typeof mod.init === "function") mod.init();

        // ✅ Permissões por usuário (modalPerms)
        try {
          const permsApp = await import("./pages/admin_perms_app.js");
          if (permsApp && typeof permsApp.initAdminPermsAppTab === "function") {
            permsApp.initAdminPermsAppTab();
            console.log("[main.js] admin_perms_app.js carregado e inicializado");
          } else {
            console.warn("[main.js] admin_perms_app.js carregado, mas initAdminPermsAppTab não encontrado");
          }
        } catch (e) {
          console.warn("[main.js] Falha ao carregar ./pages/admin_perms_app.js:", e);
        }

        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[main.js] Erro ao carregar script da página:", pageName, err);
  }
}

/**
 * Inicializa tabs genéricas (mantido).
 */
function initTabs() {
  const containers = Array.from(document.querySelectorAll("[data-tabs]"));
  if (!containers.length) return;

  containers.forEach((container) => {
    const btns = Array.from(container.querySelectorAll(".tab-btn[data-tab]"));
    if (!btns.length) return;

    const panelIds = btns.map((b) => b.getAttribute("data-tab")).filter(Boolean);
    const panels = panelIds
      .map((id) => document.querySelector(`[data-tab-panel="${id}"]`))
      .filter(Boolean);

    const activate = (tabId) => {
      btns.forEach((b) => {
        const on = b.getAttribute("data-tab") === tabId;
        b.classList.toggle("border-teal-500", on);
        b.classList.toggle("text-teal-700", on);
        b.classList.toggle("border-transparent", !on);
        b.classList.toggle("text-gray-700", !on);
      });

      panels.forEach((p) => {
        p.classList.toggle("hidden", p.getAttribute("data-tab-panel") !== tabId);
      });
    };

    btns.forEach((b) => {
      b.addEventListener("click", () => activate(b.getAttribute("data-tab")));
    });

    activate(btns[0].getAttribute("data-tab"));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadPageScript(page);
  initTabs();
});
