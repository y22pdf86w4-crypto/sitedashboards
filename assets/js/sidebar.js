// assets/js/sidebar.js

function obterTipoTelaAtual() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("select-company.html")) return "select-company";
  return "default";
}

async function carregarSidebar(options) {
  const {
    containerId = "sidebarContainer",
    basePath = ".",
    empresaSelectorPath = "./select-company.html",
  } = options || {};

  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const resp = await fetch(`${basePath}/sidebar.html`);
    if (!resp.ok) throw new Error("Erro ao carregar sidebar HTML");

    const html = await resp.text();
    container.innerHTML = html;

    const user = typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
    aplicarRBACSidebar(user);
    ligarEventosSidebar(user, empresaSelectorPath);
    configurarToggleSidebar();
  } catch (e) {
    console.error("Falha ao carregar sidebar:", e);
  }
}

function aplicarRBACSidebar(user) {
  const perfis = (user && user.perfis) || [];
  const isAdmin = perfis.includes("ADMIN");
  const ehVendedor = perfis.some((p) => p.startsWith("VENDEDOR_"));
  const ehGestor = perfis.some((p) => p.startsWith("GESTOR_"));

  const saud = document.getElementById("saudacaoSidebar");
  const nome = document.getElementById("userNameSidebar");
  if (saud && !saud.textContent) saud.textContent = "Centro de navegação";
  if (nome && !nome.textContent) {
    nome.textContent = (user && (user.nome || user.email)) || "Usuário";
  }

  const tipoTela = obterTipoTelaAtual();

  document.querySelectorAll(".sidebar-item").forEach((item) => {
    const key = item.getAttribute("data-key");
    let mostrar = false;

    if (tipoTela === "select-company") {
      if (isAdmin) {
        if (key === "selecao-empresa" || key === "logistica" || key === "usuarios-admin") {
          mostrar = true;
        }
      } else if (ehVendedor) {
        if (key === "selecao-empresa") {
          mostrar = true;
        }
      } else if (ehGestor) {
        if (key === "selecao-empresa" || key === "logistica" || key === "usuarios-admin") {
          mostrar = true;
        }
      }
    } else {
      if (isAdmin) {
        if (
          key === "logistica" ||
          key === "dashboards" ||
          key === "calendario" ||
          key === "organograma" ||
          key === "usuarios-admin" ||
          key === "selecao-empresa"
        ) {
          mostrar = true;
        }
      } else if (ehVendedor) {
        if (key === "dashboards" || key === "organograma") {
          mostrar = true;
        }
      } else if (ehGestor) {
        if (
          key === "logistica" ||
          key === "dashboards" ||
          key === "calendario" ||
          key === "organograma" ||
          key === "usuarios-admin" ||
          key === "selecao-empresa"
        ) {
          mostrar = true;
        }
      }
    }

    item.style.display = mostrar ? "" : "none";
  });
}

function ligarEventosSidebar(user, empresaSelectorPath) {
  const empresaSelecionada =
    window.sessionStorage && sessionStorage.getItem("empresaSelecionada");
  const empresaKey = (empresaSelecionada || "").toLowerCase();

  const cfgEmpresa = {
    linhagro: { calendarioPath: "./calendario.html" },
    lithoplant: { calendarioPath: "./calendario.html" },
  };
  const cfg = cfgEmpresa[empresaKey] || cfgEmpresa["linhagro"];

  const liSelecao = document.querySelector(
    ".sidebar-item[data-key='selecao-empresa']"
  );
  if (liSelecao) {
    liSelecao.onclick = () => {
      window.location.href = empresaSelectorPath;
    };
  }

  const liDash = document.querySelector(
    ".sidebar-item[data-key='dashboards']"
  );
  if (liDash) {
    liDash.onclick = () => {
      window.location.href = "./menu.html";
    };
  }

  const liLogistica = document.querySelector(
    ".sidebar-item[data-key='logistica']"
  );
  if (liLogistica) {
    liLogistica.onclick = () => {
      window.location.href = "./logistica.html";
    };
  }

  const liCalendario = document.querySelector(
    ".sidebar-item[data-key='calendario']"
  );
  if (liCalendario) {
    liCalendario.onclick = () => {
      window.location.href = cfg.calendarioPath;
    };
  }

  const liOrganograma = document.querySelector(
    ".sidebar-item[data-key='organograma']"
  );
  if (liOrganograma) {
    liOrganograma.onclick = () => {
      if (empresaKey === "linhagro") {
        window.location.href = "./org-linhagro.html";
      } else if (empresaKey === "lithoplant") {
        window.location.href = "./org-lithoplant.html";
      } else {
        window.location.href = "./org-linhagro.html";
      }
    };
  }

  const liUsuarios = document.querySelector(
    ".sidebar-item[data-key='usuarios-admin']"
  );
  if (liUsuarios) {
    liUsuarios.onclick = () => {
      window.location.href = "./cadastro_usuarios.html";
    };
  }

  const btnLogout = document.querySelector(".sidebar-logout-btn");
  if (btnLogout) {
    btnLogout.onclick = () => {
      if (typeof deslogar === "function") deslogar();
    };
  }
}

function configurarToggleSidebar() {
  const app = document.getElementById("app");
  const btnToggle = document.getElementById("btnToggleSidebar");
  if (app && btnToggle) {
    btnToggle.addEventListener("click", () => {
      app.classList.toggle("sidebar-collapsed");
    });
  }
}

window.carregarSidebar = carregarSidebar;
