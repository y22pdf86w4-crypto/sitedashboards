// ===================== USUÁRIOS / LOGIN =====================

// Login centralizado (chamado pelo index.html)
async function loginSistema(usuarioInput, senhaInput) {
  const email = (usuarioInput || "").trim();
  const senha = (senhaInput || "").trim();

  if (!email || !senha) {
    return null;
  }

  try {
    const resp = await fetch(API_BASE + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });

    if (!resp.ok) {
      return null; // login inválido
    }

    const data = await resp.json(); // { token, usuario }

    // sessionStorage (compatibilidade)
    if (window.sessionStorage) {
      sessionStorage.setItem("authToken", data.token);
      sessionStorage.setItem("usuarioNome", data.usuario.nome);
      sessionStorage.setItem("usuarioEmail", data.usuario.email);
      sessionStorage.setItem(
        "usuarioEmpresas",
        JSON.stringify(data.usuario.empresas || [])
      );
      sessionStorage.setItem(
        "usuarioPerfis",
        JSON.stringify(data.usuario.perfis || [])
      );
    }

    // localStorage (para sidebar e outras telas usarem tudo)
    if (window.localStorage) {
      localStorage.setItem("orgdash_auth", JSON.stringify(data));
    }

    // Compatibilidade com código antigo
    const userCompat = {
      email: data.usuario.email,
      nome: data.usuario.nome,
      empresas: data.usuario.empresas || [],
      tipo: (data.usuario.perfis && data.usuario.perfis[0]) || "",
      perfis: data.usuario.perfis || [],
    };

    return userCompat;
  } catch (e) {
    console.error("Erro em loginSistema:", e);
    return null;
  }
}

// Obtém usuário logado (se existir)
function getUsuarioAtual() {
  if (!window.sessionStorage) return null;

  const email = sessionStorage.getItem("usuarioEmail");
  if (!email) return null;

  const nome = sessionStorage.getItem("usuarioNome");

  let empresas = [];
  let perfis = [];
  try {
    empresas = JSON.parse(sessionStorage.getItem("usuarioEmpresas") || "[]");
  } catch (_) {
    empresas = [];
  }
  try {
    perfis = JSON.parse(sessionStorage.getItem("usuarioPerfis") || "[]");
  } catch (_) {
    perfis = [];
  }

  const token = sessionStorage.getItem("authToken") || "";

  const tipoCompat = perfis && perfis.length ? perfis[0] : "";

  return { email, nome, empresas, tipo: tipoCompat, perfis, token };
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

// ================== CONFIG E HELPERS DE API ==================

const API_BASE =
  "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";

/**
 * Monta headers padrão com x-usuario-email para auditoria + Bearer token.
 */
function buildDefaultHeaders(extra) {
  const user = getUsuarioAtual();
  const email = user && user.email ? user.email : "";
  const token = user && user.token ? user.token : "";

  return Object.assign(
    {
      "Content-Type": "application/json",
      "x-usuario-email": email,
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    extra || {}
  );
}

// Helper genérico de GET
async function apiGet(path) {
  const url = `${API_BASE}${path}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: buildDefaultHeaders({ "Content-Type": undefined }),
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
    body: JSON.stringify(bodyObj || {}),
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
    body: JSON.stringify(bodyObj || {}),
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
    headers: buildDefaultHeaders({ "Content-Type": undefined }),
  });

  if (!resp.ok && resp.status !== 204) {
    throw new Error("Erro HTTP " + resp.status);
  }

  return true;
}