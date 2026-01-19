// app/static/js/main.js

const page = document.body.dataset.page || "";

const routes = {
  precificar: () => import("./pages/precificar.js").then((module) => module.init?.()),
};

if (routes[page]) {
  routes[page]();
} else {
  console.log("main.js: Nenhuma rota JS definida para esta página.");
}
