// assets/js/atividades.js

async function carregarPaginaAtividades() {
  const user = getUsuarioAtual();
  if (!user) {
    window.location.href = "../../index.html";
    return;
  }

  const empresaSelecionada =
    window.sessionStorage && sessionStorage.getItem("empresaSelecionada");

  if (
    !empresaSelecionada ||
    !user.empresas ||
    !user.empresas.includes(empresaSelecionada)
  ) {
    window.location.href = "../select-company.html";
    return;
  }

  const empresaKey = empresaSelecionada.toLowerCase();
  if (empresaKey !== "linhagro") {
    window.location.href = "../../menu.html";
    return;
  }

  if (typeof carregarSidebar === "function") {
    await carregarSidebar({
      containerId: "sidebarContainer",
      basePath: "..",
      empresaSelectorPath: "../select-company.html",
    });
  }

  if (typeof preencherHeaderUsuario === "function") {
    preencherHeaderUsuario(user, "saudacaoSidebar", "userNameSidebar");
  }

  const liDashboards = document.querySelector(
    ".sidebar-item[data-key='dashboards']"
  );
  if (liDashboards) {
    liDashboards.classList.add("sidebar-item-active");
  }

  const app = document.getElementById("app");
  const btnToggle = document.getElementById("btnToggleSidebar");
  if (app && btnToggle) {
    btnToggle.addEventListener("click", () => {
      app.classList.toggle("sidebar-collapsed");
    });
  }
}

window.addEventListener("DOMContentLoaded", carregarPaginaAtividades);
