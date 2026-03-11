// cadastro_usuarios.js

const USUARIOS_API_BASE_PATH = "/usuarios";

let usuariosBruto = [];
let usuariosFiltrados = [];
let confirmCallback = null;

/* ==========================================================
   AUTH / API HELPERS (padrão calendário)
   ========================================================== */

function getAuthHeadersUsuarios() {
  try {
    const token =
      window.sessionStorage && window.sessionStorage.getItem("authToken");
    const headers = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers.Authorization = "Bearer " + token;
    }

    const user =
      typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
    if (user && user.email) {
      headers["x-usuario-email"] = user.email;
    }

    return headers;
  } catch (e) {
    console.warn("[USUARIOS] erro ao montar headers:", e);
    return { "Content-Type": "application/json" };
  }
}

function getApiBaseUsuarios() {
  return (
    window.API_BASE ||
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1"
  );
}

async function apiGetUsuarios(path) {
  const url = getApiBaseUsuarios() + path;
  console.log("[USUARIOS] GET", url);
  const resp = await fetch(url, {
    method: "GET",
    headers: getAuthHeadersUsuarios(),
  });
  console.log("[USUARIOS] GET status:", resp.status);

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("[USUARIOS] GET erro body:", txt);
    throw new Error("GET " + path + " status " + resp.status);
  }
  return resp.json();
}

async function apiPostUsuarios(path, body) {
  const url = getApiBaseUsuarios() + path;
  console.log("[USUARIOS] POST", url, body);
  const resp = await fetch(url, {
    method: "POST",
    headers: getAuthHeadersUsuarios(),
    body: JSON.stringify(body),
  });
  console.log("[USUARIOS] POST status:", resp.status);

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("[USUARIOS] POST erro body:", txt);
    throw new Error("POST " + path + " status " + resp.status + " - " + txt);
  }
  return resp.json().catch(() => null);
}

async function apiPutUsuarios(path, body) {
  const url = getApiBaseUsuarios() + path;
  console.log("[USUARIOS] PUT", url, body);
  const resp = await fetch(url, {
    method: "PUT",
    headers: getAuthHeadersUsuarios(),
    body: JSON.stringify(body),
  });
  console.log("[USUARIOS] PUT status:", resp.status);

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("[USUARIOS] PUT erro body:", txt);
    throw new Error("PUT " + path + " status " + resp.status + " - " + txt);
  }
  return resp.json().catch(() => null);
}

/* ==========================================================
   USUÁRIO OBRIGATÓRIO / PROTEÇÃO DE PERFIL
   ========================================================== */

function getUsuarioObrigatorio() {
  if (typeof getUsuarioAtual !== "function") {
    console.warn("[USUARIOS] getUsuarioAtual não definido.");
    window.location.href = "../../index.html";
    return null;
  }
  const user = getUsuarioAtual();
  if (!user || !user.email) {
    console.warn("[USUARIOS] Usuário inválido.");
    window.location.href = "../../index.html";
    return null;
  }

  const perfis = Array.isArray(user.perfis) ? user.perfis : user.perfis || [];
  const temAdmin =
    perfis.includes("ADMIN") ||
    perfis.includes("admin") ||
    perfis.includes("LOG_ADMIN");
  if (!temAdmin) {
    alert("Apenas usuários com perfil ADMIN podem acessar o cadastro de usuários.");
    window.location.href = "../../menu.html";
    return null;
  }

  return user;
}

/* ==========================================================
   INIT
   ========================================================== */

window.addEventListener("DOMContentLoaded", () => {
  console.log("[USUARIOS] DOMContentLoaded");

  const user = getUsuarioObrigatorio();
  if (!user) return;

  const app = document.getElementById("app");
  const btnToggle = document.getElementById("btnToggleSidebar");
  if (app && btnToggle) {
    btnToggle.addEventListener("click", () => {
      app.classList.toggle("sidebar-collapsed");
    });
  }

  // header (saudação / nome)
  if (typeof preencherHeaderUsuario === "function") {
    preencherHeaderUsuario(user, "saudacaoSidebar", "userNameSidebar");
  }
  const userNameEl = document.getElementById("userName");
  if (userNameEl) {
    userNameEl.textContent = user.nome || user.email || "Usuário Admin";
  }

  // Filtros
  document
    .getElementById("fBuscaUsuario")
    ?.addEventListener("input", aplicarFiltroLocal);
  document
    .getElementById("fPerfil")
    ?.addEventListener("change", aplicarFiltroLocal);
  document
    .getElementById("fStatus")
    ?.addEventListener("change", aplicarFiltroLocal);

  // Botões
  document
    .getElementById("btnBuscarUsuarios")
    ?.addEventListener("click", carregarUsuarios);
  document
    .getElementById("btnLimparUsuarios")
    ?.addEventListener("click", limparFiltros);
  document
    .getElementById("btnNovoUsuario")
    ?.addEventListener("click", () => abrirModalUsuario(null));

  // Modal usuário
  document
    .getElementById("btnFecharModalUsuario")
    ?.addEventListener("click", fecharModalUsuario);
  document
    .getElementById("btnCancelarUsuario")
    ?.addEventListener("click", fecharModalUsuario);
  document
    .getElementById("btnSalvarUsuario")
    ?.addEventListener("click", salvarUsuario);

  // Modal confirmação
  document
    .getElementById("btnFecharConfirmacao")
    ?.addEventListener("click", fecharModalConfirmacao);
  document
    .getElementById("btnConfirmCancelar")
    ?.addEventListener("click", fecharModalConfirmacao);
  document
    .getElementById("btnConfirmOk")
    ?.addEventListener("click", () => {
      if (typeof confirmCallback === "function") {
        const fn = confirmCallback;
        confirmCallback = null;
        fn();
      }
      fecharModalConfirmacao();
    });

  carregarUsuarios();
});

/* ==========================================================
   FILTROS / CARREGAMENTO
   ========================================================== */

function limparFiltros() {
  const fBusca = document.getElementById("fBuscaUsuario");
  const fPerfil = document.getElementById("fPerfil");
  const fStatus = document.getElementById("fStatus");

  if (fBusca) fBusca.value = "";
  if (fPerfil) fPerfil.value = "";
  if (fStatus) fStatus.value = "";

  aplicarFiltroLocal();
}

async function carregarUsuarios() {
  console.log("[USUARIOS] carregarUsuarios()");
  const tbody = document.getElementById("tbodyUsuarios");
  const info = document.getElementById("infoUsuarios");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6" class="empty-state">
        Carregando usuários...
      </td>
    </tr>
  `;
  if (info) info.textContent = "Carregando usuários...";

  const user = getUsuarioObrigatorio();
  if (!user) return;

  try {
    const data = await apiGetUsuarios(USUARIOS_API_BASE_PATH);
    // backend: { usuarios: [ { Id, Nome, Email, Ativo, Empresas, Perfis } ] }
    usuariosBruto = Array.isArray(data.usuarios) ? data.usuarios : [];
    aplicarFiltroLocal();
  } catch (e) {
    console.error("Erro ao carregar usuários:", e);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          Erro ao carregar usuários. Tente novamente.
        </td>
      </tr>
    `;
    if (info) info.textContent = "Erro ao carregar usuários";
    atualizarCardsResumo({ ativos: 0, admins: 0, inativos: 0 });
  }
}

function aplicarFiltroLocal() {
  const tbody = document.getElementById("tbodyUsuarios");
  const info = document.getElementById("infoUsuarios");
  if (!tbody) return;

  const busca = (
    document.getElementById("fBuscaUsuario")?.value || ""
  )
    .toLowerCase()
    .trim();
  const perfilFiltro = document.getElementById("fPerfil")?.value || "";
  const statusFiltro = document.getElementById("fStatus")?.value || "";

  let itens = usuariosBruto.slice();

  if (busca) {
    itens = itens.filter((u) => {
      const nome = String(u.Nome || "").toLowerCase();
      const email = String(u.Email || "").toLowerCase();
      const empresas = String(u.Empresas || "").toLowerCase();
      return (
        nome.includes(busca) ||
        email.includes(busca) ||
        empresas.includes(busca)
      );
    });
  }

  if (perfilFiltro) {
    itens = itens.filter((u) => {
      const perfis = String(u.Perfis || "");
      return perfis
        .split(",")
        .map((p) => p.trim())
        .includes(perfilFiltro);
    });
  }

  if (statusFiltro) {
    itens = itens.filter((u) => {
      const ativo = Number(u.Ativo ?? 1) === 1;
      const st = ativo ? "ativo" : "inativo";
      return st === statusFiltro;
    });
  }

  usuariosFiltrados = itens;

  if (!itens.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          Nenhum usuário encontrado com os filtros atuais.
        </td>
      </tr>
    `;
    if (info) info.textContent = "Nenhum usuário encontrado";
    atualizarCardsResumo({ ativos: 0, admins: 0, inativos: 0 });
    return;
  }

  let html = "";
  let ativos = 0;
  let admins = 0;
  let inativos = 0;

  for (const u of itens) {
    const id = u.Id;
    const nome = u.Nome || "(sem nome)";
    const email = u.Email || "";
    const ativo = Number(u.Ativo ?? 1) === 1;
    const empresasStr = u.Empresas || "";
    const perfisStr = u.Perfis || "";

    const status = ativo ? "ativo" : "inativo";
    if (ativo) ativos++;
    else inativos++;

    const perfisArr = perfisStr
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (perfisArr.includes("ADMIN")) admins++;

    const statusClass = ativo ? "status-ativo" : "status-inativo";

    html += `
      <tr data-id="${encodeHtml(String(id))}">
        <td>${encodeHtml(nome)}</td>
        <td>${encodeHtml(email)}</td>
        <td>
          ${
            perfisArr.length
              ? perfisArr
                  .map(
                    (p) =>
                      `<span class="perfil-tag ${
                        p === "ADMIN" ? "perfil-admin" : ""
                      }">${encodeHtml(p)}</span>`
                  )
                  .join(" ")
              : "—"
          }
        </td>
        <td>${encodeHtml(empresasStr)}</td>
        <td>
          <span class="status-pill ${statusClass}">
            <span class="status-pill-dot"></span>
            <span>${ativo ? "Ativo" : "Inativo"}</span>
          </span>
        </td>
        <td class="acao-col">
          <button
            type="button"
            class="btn-action-sm btn-acao-editar"
            data-acao="editar"
          >
            Editar
          </button>
          <button
            type="button"
            class="btn-action-sm btn-acao-desativar"
            data-acao="toggle"
          >
            ${ativo ? "Desativar" : "Reativar"}
          </button>
          <button
            type="button"
            class="btn-action-sm btn-acao-resetar"
            data-acao="reset"
          >
            Resetar senha
          </button>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
  tbody
    .querySelectorAll("button[data-acao]")
    .forEach((btn) =>
      btn.addEventListener("click", onClickAcaoUsuario)
    );

  if (info) {
    info.textContent = `Total filtrado: ${itens.length} usuário(s)`;
  }

  atualizarCardsResumo({ ativos, admins, inativos });
}

function atualizarCardsResumo({ ativos, admins, inativos }) {
  const cardAtivos = document.getElementById("cardUsuariosAtivos");
  const cardAdmins = document.getElementById("cardUsuariosAdmin");
  const cardInativos = document.getElementById("cardUsuariosInativos");

  if (cardAtivos) cardAtivos.textContent = String(ativos ?? 0);
  if (cardAdmins) cardAdmins.textContent = String(admins ?? 0);
  if (cardInativos) cardInativos.textContent = String(inativos ?? 0);
}

/* ==========================================================
   AÇÕES POR LINHA
   ========================================================== */

function onClickAcaoUsuario(ev) {
  const btn = ev.currentTarget;
  const tr = btn.closest("tr");
  if (!tr) return;

  const id = tr.getAttribute("data-id");
  const acao = btn.getAttribute("data-acao");

  const usuario = usuariosBruto.find(
    (u) => String(u.Id) === String(id)
  );
  if (!usuario) return;

  if (acao === "editar") {
    abrirModalUsuario(usuario);
  } else if (acao === "toggle") {
    const ativo = Number(usuario.Ativo ?? 1) === 1;
    const novoAtivo = !ativo;
    abrirConfirmacao(
      novoAtivo ? "Reativar usuário" : "Desativar usuário",
      `Confirma ${novoAtivo ? "reativar" : "desativar"} o usuário ${
        usuario.Nome || usuario.Email
      }?`,
      () => alterarStatusUsuario(usuario, novoAtivo)
    );
  } else if (acao === "reset") {
    abrirConfirmacao(
      "Resetar senha",
      `Gerar nova senha para o usuário ${
        usuario.Nome || usuario.Email
      }?`,
      () => resetarSenhaUsuario(usuario)
    );
  }
}

/* ==========================================================
   MODAL USUÁRIO
   ========================================================== */

function abrirModalUsuario(u) {
  const modal = document.getElementById("modalUsuario");
  if (!modal) return;

  const titulo = document.getElementById("modalUsuarioTitulo");
  const idInput = document.getElementById("usuarioId");
  const nomeInput = document.getElementById("usuarioNome");
  const emailInput = document.getElementById("usuarioEmail");
  const senhaInput = document.getElementById("usuarioSenha");
  const perfisInput = document.getElementById("usuarioPerfis");
  const empresasInput = document.getElementById("usuarioEmpresas");
  const erroEl = document.getElementById("usuarioErro");
  const grupoSenha = document.getElementById("grupoSenha");

  if (!titulo || !idInput || !nomeInput || !emailInput) return;

  if (u) {
    titulo.textContent = "Editar usuário";
    idInput.value = u.Id;
    nomeInput.value = u.Nome || "";
    emailInput.value = u.Email || "";
    perfisInput.value = u.Perfis || "";
    empresasInput.value = u.Empresas || "";
    const ativo = Number(u.Ativo ?? 1) === 1;
    const radio = document.querySelector(
      `input[name="usuarioStatus"][value="${ativo ? "ativo" : "inativo"}"]`
    );
    if (radio) radio.checked = true;
    if (grupoSenha) grupoSenha.style.display = "none";
    if (senhaInput) senhaInput.value = "";
    if (erroEl) erroEl.textContent = "";
  } else {
    titulo.textContent = "Novo usuário";
    idInput.value = "";
    nomeInput.value = "";
    emailInput.value = "";
    perfisInput.value = "USER";
    empresasInput.value = "";
    if (senhaInput) senhaInput.value = "";
    const radioAtivo = document.querySelector(
      'input[name="usuarioStatus"][value="ativo"]'
    );
    if (radioAtivo) radioAtivo.checked = true;
    if (grupoSenha) grupoSenha.style.display = "block";
    if (erroEl) erroEl.textContent = "";
  }

  modal.style.display = "flex";
}

function fecharModalUsuario() {
  const modal = document.getElementById("modalUsuario");
  if (modal) modal.style.display = "none";
}

/* ==========================================================
   SALVAR USUÁRIO
   ========================================================== */

async function salvarUsuario() {
  const id = document.getElementById("usuarioId")?.value || "";
  const nome = document.getElementById("usuarioNome")?.value.trim() || "";
  const email = document.getElementById("usuarioEmail")?.value.trim() || "";
  const senha = document.getElementById("usuarioSenha")?.value || "";
  const perfisRaw =
    document.getElementById("usuarioPerfis")?.value || "";
  const empresasRaw =
    document.getElementById("usuarioEmpresas")?.value || "";
  const erroEl = document.getElementById("usuarioErro");
  const status =
    document.querySelector("input[name='usuarioStatus']:checked")
      ?.value || "ativo";

  if (!nome || !email) {
    if (erroEl) erroEl.textContent = "Nome e e-mail são obrigatórios.";
    return;
  }

  const criando = !id;
  if (criando && !senha) {
    if (erroEl)
      erroEl.textContent = "Defina uma senha inicial para o novo usuário.";
    return;
  }

  const empresasCodigos = empresasRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const perfisCodigos = perfisRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ativo = status === "ativo";

  const payload = {
    nome,
    email,
    ativo,
    empresasCodigos,
    perfisCodigos,
  };

  if (criando) {
    payload.senha = senha;
  }

  const user = getUsuarioObrigatorio();
  if (!user) return;

  try {
    if (criando) {
      await apiPostUsuarios(USUARIOS_API_BASE_PATH, payload);
    } else {
      await apiPutUsuarios(
        USUARIOS_API_BASE_PATH + "/" + encodeURIComponent(id),
        payload
      );
    }

    await carregarUsuarios();
    fecharModalUsuario();
  } catch (e) {
    console.error("Erro ao salvar usuário:", e);
    if (erroEl)
      erroEl.textContent =
        "Erro ao salvar usuário. Verifique os dados e tente novamente.";
  }
}

/* ==========================================================
   STATUS / RESET SENHA
   ========================================================== */

async function alterarStatusUsuario(usuario, novoAtivo) {
  const user = getUsuarioObrigatorio();
  if (!user) return;

  const path =
    USUARIOS_API_BASE_PATH + "/" + encodeURIComponent(usuario.Id);

  try {
    await apiPutUsuarios(path, { ativo: novoAtivo });
    await carregarUsuarios();
  } catch (e) {
    console.error("Erro ao alterar status:", e);
    alert("Erro ao alterar status do usuário.");
  }
}

async function resetarSenhaUsuario(usuario) {
  const user = getUsuarioObrigatorio();
  if (!user) return;

  const novaSenha = prompt(
    "Informe a nova senha para o usuário (fluxo simplificado):"
  );
  if (!novaSenha) return;

  const path =
    USUARIOS_API_BASE_PATH +
    "/" +
    encodeURIComponent(usuario.Id) +
    "/senha";

  try {
    await apiPutUsuarios(path, { novaSenha });
    alert("Senha alterada com sucesso.");
  } catch (e) {
    console.error("Erro ao alterar senha:", e);
    alert("Erro ao alterar senha do usuário.");
  }
}

/* ==========================================================
   MODAL CONFIRMAÇÃO
   ========================================================== */

function abrirConfirmacao(titulo, mensagem, callback) {
  const modal = document.getElementById("modalConfirmacao");
  const tit = document.getElementById("confirmTitulo");
  const msg = document.getElementById("confirmMensagem");

  if (!modal || !tit || !msg) return;

  tit.textContent = titulo || "Confirmação";
  msg.textContent = mensagem || "Tem certeza?";
  confirmCallback = callback;

  modal.style.display = "flex";
}

function fecharModalConfirmacao() {
  const modal = document.getElementById("modalConfirmacao");
  if (modal) modal.style.display = "none";
  confirmCallback = null;
}

/* ==========================================================
   HELPERS
   ========================================================== */

function encodeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
