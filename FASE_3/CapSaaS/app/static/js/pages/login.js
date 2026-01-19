// app/static/js/pages/login.js
//
// Responsabilidades deste arquivo:
// 1) Enviar login via fetch (POST /api/login)
// 2) Exibir mensagem de erro no form
// 3) Abrir/fechar modal "Suporte" ao clicar em "Esqueceu sua senha?"
// 4) Garantir fechamento do modal por botão, clique no backdrop e tecla ESC
//
// Ajustes aplicados:
// - Envia credentials (cookies) para suportar autenticação via sessão quando o backend usar session/cookie
// - Trata respostas não-JSON (ex.: HTML/Texto) sem quebrar o JS
// - Mostra mensagem mais fiel ao backend (message/error/detail) quando vier 401/400
// - Evita múltiplos submits simultâneos (desabilita botão durante request)

(function () {
  // ===============================
  // Helpers de DOM
  // ===============================
  function $(selector) {
    return document.querySelector(selector);
  }

  function show(el) {
    if (!el) return;
    el.classList.remove("hidden");
  }

  function hide(el) {
    if (!el) return;
    el.classList.add("hidden");
  }

  // ===============================
  // Elementos principais
  // ===============================
  const loginForm = $("#loginForm");
  const emailInput = $("#email");
  const passwordInput = $("#password");

  const errorWrap = $("#errorMessage");
  const errorText = $("#errorText");

  const btnForgot = $("#btnForgot");

  // (Opcional) botão submit se existir
  const btnSubmit = loginForm?.querySelector('button[type="submit"]') || null;

  // Modal
  const modal = $("#appModal");
  const modalTitle = $("#modalTitle");
  const modalBody = $("#modalBody");
  const btnCloseModal = $("#btnCloseModal");

  // ===============================
  // UI: erro do login
  // ===============================
  function setError(message) {
    if (!errorWrap || !errorText) return;

    errorText.textContent = message || "Acesso negado. Verifique os dados.";
    show(errorWrap);

    // Pequena “chacoalhada” para feedback visual (usa .animate-shake do base.css)
    loginForm?.classList.add("animate-shake");
    window.setTimeout(() => loginForm?.classList.remove("animate-shake"), 400);
  }

  function clearError() {
    hide(errorWrap);
    if (errorText) errorText.textContent = "";
  }

  function setSubmitting(isSubmitting) {
    if (!btnSubmit) return;
    btnSubmit.disabled = !!isSubmitting;
    btnSubmit.setAttribute("aria-busy", isSubmitting ? "true" : "false");
  }

  // ===============================
  // Modal: abrir / fechar
  // ===============================
  function openModal(title, body) {
    if (!modal) return;

    if (modalTitle) modalTitle.textContent = title || "Suporte";
    if (modalBody) modalBody.textContent = body || "Entre em contato com o administrador para recuperar seu acesso.";

    show(modal);

    // acessibilidade: foca no botão fechar
    window.setTimeout(() => btnCloseModal?.focus(), 0);
  }

  function closeModal() {
    hide(modal);
  }

  function isModalOpen() {
    return modal && !modal.classList.contains("hidden");
  }

  // ===============================
  // Eventos do modal
  // ===============================
  function bindModalEvents() {
    if (!modal) return;

    // Fecha no botão
    btnCloseModal?.addEventListener("click", closeModal);

    // Fecha clicando no backdrop (fora do card)
    modal.addEventListener("click", (e) => {
      const clickedBackdrop = e.target?.dataset?.modalBackdrop === "true";
      if (clickedBackdrop) closeModal();
    });

    // Fecha com ESC
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isModalOpen()) closeModal();
    });
  }

  // ===============================
  // HTTP helpers
  // ===============================
  async function readResponseBody(resp) {
    const ct = (resp.headers.get("content-type") || "").toLowerCase();

    // Tenta JSON primeiro quando apropriado
    if (ct.includes("application/json")) {
      try {
        return await resp.json();
      } catch (_) {
        return null;
      }
    }

    // Fallback para texto
    try {
      const txt = await resp.text();
      return txt;
    } catch (_) {
      return null;
    }
  }

  function extractMessage(payload, fallback) {
    if (!payload) return fallback;

    // Se veio texto (HTML/erro), tenta usar isso de forma curta
    if (typeof payload === "string") {
      const s = payload.trim();
      if (!s) return fallback;
      return s.length > 180 ? s.slice(0, 180) + "..." : s;
    }

    // Se veio JSON, tenta campos comuns
    if (typeof payload === "object") {
      return (
        payload.message ||
        payload.error ||
        payload.detail ||
        payload.msg ||
        fallback
      );
    }

    return fallback;
  }

  // ===============================
  // Login: submit via API
  // ===============================
  let isSubmitting = false;

  async function handleLoginSubmit(e) {
    e.preventDefault();
    clearError();

    if (isSubmitting) return;

    const email = (emailInput?.value || "").trim();
    const password = (passwordInput?.value || "").trim();

    if (!email || !password) {
      setError("Informe e-mail e senha.");
      return;
    }

    isSubmitting = true;
    setSubmitting(true);

    try {
      const resp = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Importante: se o backend usa cookie de sessão, isto é necessário
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const payload = await readResponseBody(resp);

      // Alguns backends retornam {ok: true, redirect: "..."}.
      // Outros retornam {success: true, ...}. Mantemos compatibilidade.
      const okFlag =
        (payload && typeof payload === "object" && (payload.ok === true || payload.success === true)) || false;

      if (!resp.ok || !okFlag) {
        const msg = extractMessage(payload, "Acesso negado. Verifique os dados.");
        setError(msg);
        return;
      }

      // Redireciona para o pós-login (vindo do backend)
      const redirectTo =
        (payload && typeof payload === "object" && (payload.redirect || payload.next)) || "/plataformas";

      window.location.href = redirectTo;
    } catch (err) {
      setError("Falha de comunicação. Tente novamente.");
    } finally {
      isSubmitting = false;
      setSubmitting(false);
    }
  }

  // ===============================
  // “Esqueceu sua senha?”
  // ===============================
  function bindForgotPassword() {
    btnForgot?.addEventListener("click", () => {
      openModal(
        "Suporte",
        "Entre em contato com o administrador para recuperar seu acesso."
      );
    });
  }

  // ===============================
  // Init
  // ===============================
  function init() {
    bindModalEvents();
    bindForgotPassword();

    loginForm?.addEventListener("submit", handleLoginSubmit);

    // Enter no campo senha já submete (por padrão do form), mas garantimos UX:
    passwordInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        clearError();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
