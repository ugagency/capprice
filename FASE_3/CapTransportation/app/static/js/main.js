// static/js/main.js
import { getPerms, canAccess } from "./pages/_shared.js";

import { initMestre } from "./pages/mestre.js";
import { initComercial } from "./pages/comercial.js";
import { initProgramacao } from "./pages/programacao.js";
import { initIndustrial } from "./pages/industrial.js";
import { initLaboratorio } from "./pages/laboratorio.js";
import { initFaturamento } from "./pages/faturamento.js";

function hideLink(anchor) {
  if (!anchor) return;
  anchor.style.display = "none";
  anchor.setAttribute("aria-hidden", "true");
  anchor.tabIndex = -1;
  anchor.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}

function applyNavPermissions() {
  const perms = getPerms();

  const rules = [
    { href: "/mestre", key: "mestre" },
    { href: "/comercial", key: "comercial" },
    { href: "/programacao", key: "programacao" },
    { href: "/industrial", key: "industrial" },
    { href: "/laboratorio", key: "laboratorio" },
    { href: "/faturamento", key: "faturamento" },
  ];

  rules.forEach((r) => {
    const allowed = canAccess(r.key, perms);
    document.querySelectorAll(`a[href="${r.href}"]`).forEach((a) => {
      if (!allowed) hideLink(a);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyNavPermissions();

  const page = document.body?.dataset?.page || "mestre";

  const map = {
    mestre: initMestre,
    comercial: initComercial,
    programacao: initProgramacao,
    industrial: initIndustrial,
    laboratorio: initLaboratorio,
    faturamento: initFaturamento,
  };

  const fn = map[page] || initMestre;
  fn();
});
