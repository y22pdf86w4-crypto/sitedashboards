// assets/js/global.js

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
  }

  return user;
}

// Obtém usuário logado (se existir)
function getUsuarioAtual() {
  if (!window.sessionStorage) return null;

  const email = sessionStorage.getItem("usuarioEmail");
  if (!email) return null;

  const nome = sessionStorage.getItem("usuarioNome");
  let empresas = [];
  try {
    empresas = JSON.parse(sessionStorage.getItem("usuarioEmpresas") || "[]");
  } catch (e) {
    empresas = [];
  }

  return { email, nome, empresas };
}

// Logout
function deslogar() {
  if (window.sessionStorage) {
    sessionStorage.clear();
  }
  window.location.href = "../index.html";
}
