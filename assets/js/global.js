// ===================== USUÁRIOS / LOGIN =====================

// Tabela de usuários e permissões
const USERS = [
  {
    email: "admin",
    senha: "admin",
    tipo: "ADMIN",
    empresas: ["linhagro", "lithoplant"],
    nome: "Usuário Padrão"
  },
  {
    email: "luciano.rastoldo@lithoplant.com.br",
    senha: "admin",
    tipo: "ADMIN",
    empresas: ["linhagro", "lithoplant"],
    nome: "Luciano Rastoldo"
  },
  {
    email: "marcussi@linhagro.com.br",
    senha: "admin",
    tipo: "ADMIN",
    empresas: ["linhagro", "lithoplant"],
    nome: "Robson Marcussi"
  },
  {
    email: "joaogabriel.reis@linhagro.com.br",
    senha: "admin",
    tipo: "ADMIN",
    empresas: ["linhagro", "lithoplant"],
    nome: "João Gabriel Reis"
  },
  {
    email: "g.comercial@lithoplant.com.br",
    senha: "admin",
    tipo: "LITHO_ONLY",
    empresas: ["lithoplant"],
    nome: "Wesley Nunes"
  },
  {
    email: "g.comercial@linhagro.com.br",
    senha: "admin",
    tipo: "LINHA_ONLY",
    empresas: ["linhagro"],
    nome: "Gustavo Braga"
  },

  // ==== VENDEDORES LITHOPLANT ====
  {
    email: "ctvcentrosul@lithoplant.com.br",
    senha: "admin",
    tipo: "LITHO_ONLY",
    empresas: ["lithoplant"],
    nome: "Gracielli"
  },
  {
    email: "joaopaulo.damascena@lithoplant.com.br",
    senha: "admin",
    tipo: "LITHO_ONLY",
    empresas: ["lithoplant"],
    nome: "João Paulo"
  },
  {
    email: "ctvsulbahia@lithoplant.com.br",
    senha: "admin",
    tipo: "LITHO_ONLY",
    empresas: ["lithoplant"],
    nome: "Paulo Modesto"
  },
  {
    email: "raphael.brandao@lithoplant.com.br",
    senha: "admin",
    tipo: "LITHO_ONLY",
    empresas: ["lithoplant"],
    nome: "Raphael Brandão"
  }
];

// Login centralizado (chamado pelo index.html)
function loginSistema(usuarioInput, senhaInput) {
  const usuario = (usuarioInput || "").trim().toLowerCase();
  const senha = (senhaInput || "").trim();

  const user = USERS.find(
    (u) => u.email.toLowerCase() === usuario && u.senha === senha
  );

  if (!user) {
    return null; // login inválido
  }

  // Salva dados mínimos na sessão
  if (window.sessionStorage) {
    sessionStorage.setItem("usuarioNome", user.nome);
    sessionStorage.setItem("usuarioEmail", user.email);
    sessionStorage.setItem("usuarioEmpresas", JSON.stringify(user.empresas));
    sessionStorage.setItem("usuarioTipo", user.tipo || "");
  }

  return user;
}

// Obtém usuário logado (se existir)
function getUsuarioAtual() {
  if (!window.sessionStorage) return null;

  const email = sessionStorage.getItem("usuarioEmail");
  if (!email) return null;

  const nome = sessionStorage.getItem("usuarioNome");
  const tipo = sessionStorage.getItem("usuarioTipo") || "";
  let empresas = [];
  try {
    empresas = JSON.parse(sessionStorage.getItem("usuarioEmpresas") || "[]");
  } catch (e) {
    empresas = [];
  }

  return { email, nome, empresas, tipo };
}

// Logout
function deslogar() {
  try {
    if (window.sessionStorage) {
      sessionStorage.clear();
    }
    if (window.localStorage) {
      localStorage.clear();
    }
  } catch (e) {
    console.error(e);
  }

  // Sempre volta para o index da raiz da aplicação
  window.location.href = "/index.html";
}

// ================= MENUS / RBAC / HEADER ====================

/**
 * Valida se usuário está logado e se possui acesso à empresa.
 * Se não tiver, redireciona para o login.
 * Retorna o objeto user se estiver tudo ok.
 */
function validarAcessoEmpresa(codEmpresa) {
  const user = getUsuarioAtual();
  if (!user || !Array.isArray(user.empresas) || !user.empresas.includes(codEmpresa)) {
    window.location.href = "/index.html";
    return null;
  }
  return user;
}

/**
 * Preenche saudação e chip do usuário no header.
 */
function preencherHeaderUsuario(user, saudacaoId, userNameId) {
  const saudacao = document.getElementById(saudacaoId);
  const userName = document.getElementById(userNameId);

  if (user && user.nome) {
    if (saudacao) {
      saudacao.textContent =
        "Bem-vindo, " + user.nome + ". Selecione um dashboard para abrir.";
    }
    if (userName) userName.textContent = user.nome;
  } else if (saudacao) {
    saudacao.textContent = "Selecione um dashboard para abrir.";
  }
}

/**
 * Gera partículas de fundo no container informado.
 */
function gerarParticulasSelector(selector, totalParticles) {
  const container = document.querySelector(selector);
  if (!container) return;
  for (let i = 0; i < totalParticles; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    p.style.left = Math.random() * 100 + "vw";
    p.style.animationDelay = Math.random() * 20 + "s";
    p.style.opacity = (0.15 + Math.random() * 0.7).toFixed(2);
    container.appendChild(p);
  }
}

/**
 * Monta cards de dashboards em um grid, com RBAC por empresa, tipo e usuário.
 */
function montarHubGenerico(options) {
  const { gridId, dashboards, user, empresaObrigatoria } = options || {};
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = "";

  const userTipo = user && user.tipo ? user.tipo : "";
  const userEmail = user && user.email ? user.email.toLowerCase() : "";
  const isMasterAdmin = userEmail === "admin"; // só o usuário admin vê tudo

  dashboards
    .filter((dash) => {
      // Empresa obrigatória
      if (empresaObrigatoria && dash.empresa && dash.empresa !== empresaObrigatoria) {
        return false;
      }

      // RBAC por usuário específico (ignorado para o admin master)
      if (!isMasterAdmin && Array.isArray(dash.usuariosPermitidos) && dash.usuariosPermitidos.length > 0) {
        if (!userEmail) return false;
        const emailsNorm = dash.usuariosPermitidos.map((e) => (e || "").toLowerCase());
        if (!emailsNorm.includes(userEmail)) return false;
      }

      // RBAC por tipo (role) (ignorado para o admin master)
      if (!isMasterAdmin && Array.isArray(dash.tiposPermitidos) && dash.tiposPermitidos.length > 0) {
        if (!userTipo) return false;
        if (!dash.tiposPermitidos.includes(userTipo)) return false;
      }

      return true;
    })
    .forEach((dash) => {
      const card = document.createElement("article");
      card.className = "glass-card";
      card.tabIndex = 0;
      card.role = "button";
      card.setAttribute("aria-label", "Abrir dashboard " + (dash.titulo || ""));

      card.innerHTML = `
        <div class="glass-card__header">
          <div class="glass-card__icon-wrap">
            ${
              dash.iconImg
                ? `<img src="${dash.iconImg}" alt="" />`
                : `<span>${dash.iconEmoji || "📊"}</span>`
            }
          </div>
          <div>
            <h2 class="glass-card__title">${dash.titulo || ""}</h2>
            <p class="glass-card__meta">${dash.descricaoCurta || ""}</p>
          </div>
        </div>
        <p class="glass-card__description">
          ${dash.descricaoLonga || ""}
        </p>
        <div class="glass-card__footer">
          <span>${dash.frequencia || ""}</span>
          <button type="button" class="btn-access glass-card__cta">
            <span>Abrir dashboard</span>
            <span class="btn-access-glow"></span>
          </button>
        </div>
      `;

      const abrir = () => {
        if (dash.url) {
          window.location.href = dash.url;
        }
      };

      const btn = card.querySelector(".glass-card__cta");
      if (btn) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          abrir();
        });
      }
      card.addEventListener("click", abrir);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          abrir();
        }
      });

      grid.appendChild(card);
    });
}

/**
 * Protege páginas de Power BI por empresa.
 */
function validarAcessoDashboardEmpresa(codEmpresa) {
  const user = validarAcessoEmpresa(codEmpresa);
  return !!user;
}

/**
 * Protege dashboards VIP por empresa + lista de e-mails.
 */
function validarAcessoDashboardVip(codEmpresa, emailsPermitidos) {
  const user = getUsuarioAtual();
  if (
    !user ||
    !Array.isArray(user.empresas) ||
    !user.empresas.includes(codEmpresa)
  ) {
    window.location.href = "/index.html";
    return false;
  }

  const emailUser = (user.email || "").toLowerCase();
  const isMasterAdmin = emailUser === "admin"; // admin master abre todos os VIPs

  if (!isMasterAdmin) {
    const lista = (emailsPermitidos || []).map((e) => (e || "").toLowerCase());
    if (!lista.includes(emailUser)) {
      window.location.href = "/index.html";
      return false;
    }
  }

  return true;
}

// ================== CONFIG E HELPERS DE API ==================

const API_BASE =
  "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";

/**
 * Monta headers padrão com x-usuario-email para auditoria.
 */
function buildDefaultHeaders(extra) {
  const user = getUsuarioAtual();
  const email = user && user.email ? user.email : "";
  return Object.assign(
    {
      "Content-Type": "application/json",
      "x-usuario-email": email
    },
    extra || {}
  );
}

// Helper genérico de GET
async function apiGet(path) {
  const url = `${API_BASE}${path}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: buildDefaultHeaders({ "Content-Type": undefined })
  });

  if (!resp.ok) {
    throw new Error("Erro HTTP " + resp.status);
  }

  return resp.json();
}

// Helper genérico de POST
async function apiPost(path, bodyObj) {
  const url = `${API_BASE}${path}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: buildDefaultHeaders(),
    body: JSON.stringify(bodyObj || {})
  });

  if (!resp.ok) {
    throw new Error("Erro HTTP " + resp.status);
  }

  return resp.json();
}

// Helper genérico de PUT
async function apiPut(path, bodyObj) {
  const url = `${API_BASE}${path}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: buildDefaultHeaders(),
    body: JSON.stringify(bodyObj || {})
  });

  if (!resp.ok) {
    throw new Error("Erro HTTP " + resp.status);
  }

  return resp.json();
}

// Helper genérico de DELETE
async function apiDelete(path) {
  const url = `${API_BASE}${path}`;
  const resp = await fetch(url, {
    method: "DELETE",
    headers: buildDefaultHeaders({ "Content-Type": undefined })
  });

  if (!resp.ok && resp.status !== 204) {
    throw new Error("Erro HTTP " + resp.status);
  }

  return true;
}
