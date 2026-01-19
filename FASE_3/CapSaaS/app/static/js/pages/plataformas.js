// app/static/js/pages/plataformas.js

let redirectTimer = null;

function qs(sel) {
  return document.querySelector(sel);
}

function openConnectModal({ title, message }) {
  const modal = qs("#modalConnect");
  const t = qs("#connectTitle");
  const m = qs("#connectMessage");

  if (t) t.textContent = title || "Conectando...";
  if (m) m.textContent = message || "";

  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    document.body.style.overflow = "hidden";
  }
}

function closeConnectModal() {
  const modal = qs("#modalConnect");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
  document.body.style.overflow = "";

  if (redirectTimer) {
    clearTimeout(redirectTimer);
    redirectTimer = null;
  }
}

function bindConnectModalClose() {
  const modal = qs("#modalConnect");
  const btn = qs("#btnCloseConnect");

  btn?.addEventListener("click", closeConnectModal);

  // clique no backdrop fecha
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeConnectModal();
  });

  // ESC fecha
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeConnectModal();
  });
}

function bindCards() {
  document.querySelectorAll(".system-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      const route = btn.getAttribute("data-route");
      const system = btn.getAttribute("data-system") || "Módulo";
      const ready = (btn.getAttribute("data-ready") || "0") === "1";

      if (!route) return;

      if (!ready) {
        openConnectModal({
          title: "Conectando...",
          message: `Iniciando sessão segura no ${system}. Este módulo está em construção e será liberado em breve.`,
        });
        return;
      }

      // módulo pronto: mostra modal e redireciona
      openConnectModal({
        title: "Conectando...",
        message: `Iniciando sessão segura no ${system}. Aguarde o redirecionamento.`,
      });

      redirectTimer = setTimeout(() => {
        window.location.href = route;
      }, 450);
    });
  });
}

function bindLogout() {
  const btn = document.getElementById("btnLogout");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/logout", { method: "POST" });
      const data = await res.json();
      window.location.href = data.redirect || "/";
    } catch (e) {
      window.location.href = "/";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindCards();
  bindLogout();
  bindConnectModalClose();
});
