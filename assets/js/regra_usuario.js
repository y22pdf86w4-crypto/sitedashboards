// ================== CONFIG / ESTADO ==================

if (!window.API_BASE) {
  window.API_BASE =
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
}

let permissoesAtuais = []; // array MERGEADO: 1 item por tela
let usuarioSelecionadoId = null;

const loaderOverlay = document.getElementById("loaderOverlay");
let loaderTimerId = null;

// ================== LOADER ==================

function setLoadingRegras(isLoading) {
  if (!loaderOverlay) return;

  if (isLoading) {
    if (loaderTimerId !== null) clearTimeout(loaderTimerId);
    loaderTimerId = setTimeout(() => {
      loaderOverlay.style.display = "flex";
    }, 50);
  } else {
    if (loaderTimerId !== null) {
      clearTimeout(loaderTimerId);
      loaderTimerId = null;
    }
    loaderOverlay.style.display = "none";
  }
}

// ================== AUTENTICAÇÃO ==================

function getUsuarioObrigatorioRegras() {
  const user =
    typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;

  if (!user || !user.email) {
    window.location.href = "/index.html";
    return null;
  }
  return user;
}

function getAuthHeadersRegras() {
  const user = getUsuarioObrigatorioRegras();
  if (!user) return { "Content-Type": "application/json" };

  let headers;
  if (typeof getAuthHeadersCalendario === "function") {
    headers = getAuthHeadersCalendario();
  } else {
    headers = { "Content-Type": "application/json" };
    try {
      const token =
        (window.sessionStorage && sessionStorage.getItem("authToken")) || null;
      if (token) headers["Authorization"] = "Bearer " + token;
    } catch (e) {
      console.warn("[REGRAS] Erro ao ler authToken:", e);
    }
  }

  headers["x-usuario-email"] = user.email;
  return headers;
}

async function apiGetRegras(path) {
  const base = window.API_BASE;
  if (!base) throw new Error("API base não configurada");

  const url = base + path;
  const headers = getAuthHeadersRegras();

  let resp;
  try {
    resp = await fetch(url, { method: "GET", headers });
  } catch (err) {
    console.error("[REGRAS][GET] Erro de rede/fetch:", err);
    throw new Error("Falha na comunicação com o servidor");
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("[REGRAS][GET] HTTP", resp.status, txt);
    throw new Error("HTTP " + resp.status + " ao chamar " + path);
  }

  return resp.json();
}

async function apiPutRegras(path, bodyObj) {
  const base = window.API_BASE;
  if (!base) throw new Error("API base não configurada");

  const url = base + path;
  const headers = getAuthHeadersRegras();

  let resp;
  try {
    resp = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify(bodyObj || {}),
    });
  } catch (err) {
    console.error("[REGRAS][PUT] Erro de rede/fetch:", err);
    throw new Error("Falha na comunicação com o servidor");
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("[REGRAS][PUT] HTTP", resp.status, txt);
    throw new Error("HTTP " + resp.status + " ao chamar " + path);
  }

  return resp.json();
}

// ================== BOOTSTRAP ==================

window.addEventListener("DOMContentLoaded", () => {
  const user = getUsuarioObrigatorioRegras();
  if (!user) return;

  const nomeEl = document.getElementById("regrasUserNome");
  const emailEl = document.getElementById("regrasUserEmail");
  if (nomeEl) nomeEl.textContent = user.nome || "Usuário VISYA";
  if (emailEl) emailEl.textContent = user.email || "";

  const selectUsuario = document.getElementById("fUsuario");
  const btnRecarregar = document.getElementById("btnRecarregarPermissoes");
  const btnSalvar = document.getElementById("btnSalvarPermissoes");
  const btnSelecionarTodos = document.getElementById("btnSelecionarTodos");
  const moduloFiltroEl = document.getElementById("fModulo");

  if (selectUsuario) {
    selectUsuario.addEventListener("change", () => {
      usuarioSelecionadoId = selectUsuario.value || null;
      if (usuarioSelecionadoId) carregarPermissoes();
      else limparTabelaPermissoes();
    });
  }

  if (btnRecarregar) {
    btnRecarregar.addEventListener("click", () => {
      if (usuarioSelecionadoId) carregarPermissoes();
    });
  }

  if (btnSalvar) {
    btnSalvar.addEventListener("click", salvarPermissoes);
  }

  if (btnSelecionarTodos) {
    btnSelecionarTodos.addEventListener("click", selecionarTodos);
  }

  if (moduloFiltroEl) {
    moduloFiltroEl.addEventListener("input", () => {
      syncPillFromText();
      if (usuarioSelecionadoId) carregarPermissoes();
    });
  }

  initModulosStrip();
  carregarUsuariosParaSelect();
});

// ================== CARREGAR USUÁRIOS ==================

async function carregarUsuariosParaSelect() {
  const selectUsuario = document.getElementById("fUsuario");
  if (!selectUsuario) return;

  setLoadingRegras(true);
  try {
    const data = await apiGetRegras("/usuarios");
    const usuarios = Array.isArray(data.usuarios) ? data.usuarios : [];

    selectUsuario.innerHTML =
      '<option value="">Selecione um usuário...</option>';

    usuarios.forEach((u) => {
      const id = u.Id;
      const nome = u.Nome;
      const email = u.Email;

      const opt = document.createElement("option");
      opt.value = id != null ? String(id) : "";
      opt.textContent = `${nome}${email ? " (" + email + ")" : ""}`;
      opt.dataset.email = email || "";
      selectUsuario.appendChild(opt);
    });
  } catch (e) {
    console.error("[REGRAS][carregarUsuarios] Erro:", e);
    alert("Erro ao carregar lista de usuários.");
  } finally {
    setLoadingRegras(false);
  }
}

// ================== CARREGAR TELAS + PERMISSÕES (MERGE) ==================

async function carregarPermissoes() {
  const tbody = document.getElementById("tbodyPermissoes");
  const info = document.getElementById("infoRegistrosRegras");
  const moduloFiltroEl = document.getElementById("fModulo");
  if (!tbody || !usuarioSelecionadoId) return;

  const moduloFiltro = (moduloFiltroEl?.value || "").trim().toUpperCase();

  setLoadingRegras(true);
  tbody.innerHTML = `
    <tr>
      <td colspan="3" class="regras-empty">
        Carregando permissões...
      </td>
    </tr>
  `;
  if (info) info.textContent = "Carregando permissões...";

  try {
    const respTelas = await apiGetRegras("/telas");
    const telas = Array.isArray(respTelas.telas) ? respTelas.telas : [];

    const respPerm = await apiGetRegras(
      `/usuarios/${usuarioSelecionadoId}/telas-permissoes`
    );
    const permissoesUsuario = Array.isArray(respPerm.permissoes)
      ? respPerm.permissoes
      : [];

    const mapaPerm = new Map();
    permissoesUsuario.forEach((p) => {
      mapaPerm.set(p.idTela, p);
    });

    let merged = telas.map((t) => {
      const perm = mapaPerm.get(t.Id);
      const nivelAcesso = perm ? (perm.nivelAcesso || "N") : "N";
      const podeVer = perm ? !!perm.podeVer : false;
      const descricaoNivelAcesso = perm
        ? perm.descricaoNivelAcesso
        : "Nenhum acesso";

      return {
        idTela: t.Id,
        modulo: t.Modulo,
        nomeTela: t.NomeTela,
        codigoTela: t.CodigoTela,
        rota: t.Rota,
        nivelAcesso,
        podeVer,
        descricaoNivelAcesso,
      };
    });

    if (moduloFiltro) {
      merged = merged.filter((p) =>
        String(p.modulo || "").toUpperCase().includes(moduloFiltro)
      );
    }

    permissoesAtuais = merged;
    renderTabelaPermissoes();
  } catch (e) {
    console.error("[REGRAS][carregarPermissoes] Erro:", e);
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="regras-empty">
          Erro ao carregar permissões. Tente novamente.
        </td>
      </tr>
    `;
    if (info) info.textContent = "Erro ao carregar permissões (veja console).";
  } finally {
    setLoadingRegras(false);
  }
}

// ================== RENDER TABELA EM CASCATA ==================

function renderTabelaPermissoes() {
  const tbody = document.getElementById("tbodyPermissoes");
  const info = document.getElementById("infoRegistrosRegras");
  if (!tbody) return;

  if (!permissoesAtuais.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="regras-empty">
          Nenhuma tela encontrada para este usuário.
        </td>
      </tr>
    `;
    if (info) info.textContent = "Nenhuma tela encontrada para este usuário.";
    atualizarResumoPermissoes();
    return;
  }

  const grupos = new Map();
  permissoesAtuais.forEach((p) => {
    if (!grupos.has(p.modulo)) grupos.set(p.modulo, []);
    grupos.get(p.modulo).push(p);
  });

  let html = "";

  grupos.forEach((telas, modulo) => {
    const total = telas.length;
    const comAcesso = telas.filter(
      (p) => p.nivelAcesso === "R" || p.nivelAcesso === "W"
    ).length;

    const todosMarcados = comAcesso === total && total > 0;
    const nenhumMarcado = comAcesso === 0;
    const estadoModulo = todosMarcados
      ? "all"
      : nenhumMarcado
      ? "none"
      : "mixed";

    const moduloId = `mod-${escapeHtml(String(modulo))}`.replace(/\s+/g, "-");

    html += `
      <tr class="linha-modulo" data-modulo="${escapeHtml(modulo)}">
        <td colspan="2" class="modulo-cell" data-target="${moduloId}">
          <span class="modulo-title">${escapeHtml(modulo || "SEM MÓDULO")}</span>
        </td>
        <td style="text-align:center;">
          <input
            type="checkbox"
            class="modulo-checkbox"
            data-modulo="${escapeHtml(modulo)}"
            data-estado="${estadoModulo}"
            ${todosMarcados ? "checked" : ""}
          />
        </td>
      </tr>
      <tr class="grupo-telas" id="${moduloId}" style="display:none;">
        <td colspan="3">
          <table class="subtabela-telas">
            <tbody>
    `;

    telas.forEach((p) => {
      const temAcesso = p.nivelAcesso === "R" || p.nivelAcesso === "W";
      html += `
        <tr>
          <td style="width:30%;"></td>
          <td>${escapeHtml(p.nomeTela || "")}</td>
          <td style="text-align:center;">
            <input
              type="checkbox"
              class="nivel-checkbox"
              data-tela-id="${p.idTela}"
              data-modulo="${escapeHtml(p.modulo || "")}"
              ${temAcesso ? "checked" : ""}
            />
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // clique no módulo abre/fecha
  tbody.querySelectorAll(".modulo-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const id = cell.dataset.target;
      const grupo = document.getElementById(id);
      if (!grupo) return;
      const isHidden = grupo.style.display === "none";
      grupo.style.display = isHidden ? "" : "none";
      cell.parentElement.classList.toggle("linha-modulo-aberta", isHidden);
    });
  });

  // checkbox do módulo controla filhos
  tbody.querySelectorAll(".modulo-checkbox").forEach((chk) => {
    chk.addEventListener("change", () => {
      const modulo = chk.dataset.modulo;
      const marcar = chk.checked;
      tbody
        .querySelectorAll(
          `.nivel-checkbox[data-modulo="${CSS.escape(modulo)}"]`
        )
        .forEach((filho) => {
          filho.checked = marcar;
        });
      atualizarEstadoModulos();
      atualizarResumoPermissoes();
    });
  });

  // checkbox das telas atualiza módulo
  tbody.querySelectorAll(".nivel-checkbox").forEach((chk) => {
    chk.addEventListener("change", () => {
      atualizarEstadoModulos();
      atualizarResumoPermissoes();
    });
  });

  if (info) {
    info.textContent = "Total de telas: " + String(permissoesAtuais.length);
  }

  atualizarEstadoModulos();
  atualizarResumoPermissoes();
}

// ================== ESTADO DOS MÓDULOS ==================

function atualizarEstadoModulos() {
  const tbody = document.getElementById("tbodyPermissoes");
  if (!tbody) return;

  const modulos = new Set();
  tbody.querySelectorAll(".nivel-checkbox").forEach((chk) => {
    modulos.add(chk.dataset.modulo);
  });

  modulos.forEach((modulo) => {
    const filhos = Array.from(
      tbody.querySelectorAll(
        `.nivel-checkbox[data-modulo="${CSS.escape(modulo)}"]`
      )
    );
    const total = filhos.length;
    const marcados = filhos.filter((f) => f.checked).length;

    const chkModulo = tbody.querySelector(
      `.modulo-checkbox[data-modulo="${CSS.escape(modulo)}"]`
    );
    if (!chkModulo) return;

    if (marcados === 0) {
      chkModulo.checked = false;
      chkModulo.indeterminate = false;
      chkModulo.dataset.estado = "none";
    } else if (marcados === total) {
      chkModulo.checked = true;
      chkModulo.indeterminate = false;
      chkModulo.dataset.estado = "all";
    } else {
      chkModulo.checked = false;
      chkModulo.indeterminate = true;
      chkModulo.dataset.estado = "mixed";
    }
  });
}

// ================== RESUMO ==================

function atualizarResumoPermissoes() {
  const cardComAcesso = document.getElementById("cardTelasComAcesso");
  const cardLeitura = document.getElementById("cardTelasLeitura");
  const cardEscrita = document.getElementById("cardTelasEscrita");
  const cardNenhum = document.getElementById("cardTelasNenhum");

  let nComAcesso = 0;
  let nNenhum = 0;

  const tbody = document.getElementById("tbodyPermissoes");
  if (tbody) {
    tbody.querySelectorAll(".nivel-checkbox").forEach((chk) => {
      if (chk.checked) nComAcesso++;
      else nNenhum++;
    });
  }

  if (cardComAcesso) cardComAcesso.textContent = String(nComAcesso);
  if (cardLeitura) cardLeitura.textContent = "0"; // não diferenciamos R/W
  if (cardEscrita) cardEscrita.textContent = "0";
  if (cardNenhum) cardNenhum.textContent = String(nNenhum);

  const btn = document.getElementById("btnSelecionarTodos");
  if (btn && tbody) {
    const checks = Array.from(tbody.querySelectorAll(".nivel-checkbox"));
    const total = checks.length;
    const marcados = checks.filter((c) => c.checked).length;
    const tudoMarcado = total > 0 && marcados === total;
    btn.textContent = tudoMarcado ? "Desmarcar todos" : "Selecionar todos";
  }
}

// ================== SELECIONAR / DESMARCAR TODOS ==================

function selecionarTodos() {
  const tbody = document.getElementById("tbodyPermissoes");
  const btn = document.getElementById("btnSelecionarTodos");
  if (!tbody || !btn) return;

  const checkboxes = Array.from(tbody.querySelectorAll(".nivel-checkbox"));
  const total = checkboxes.length;
  const marcados = checkboxes.filter((c) => c.checked).length;
  const tudoMarcado = total > 0 && marcados === total;

  const novoValor = !tudoMarcado;

  checkboxes.forEach((chk) => {
    chk.checked = novoValor;
  });

  atualizarEstadoModulos();
  atualizarResumoPermissoes();
}

// ================== FAIXA DE MÓDULOS (PÍLULAS) ==================

function initModulosStrip() {
  const strip = document.getElementById("modulosStrip");
  const moduloFiltroEl = document.getElementById("fModulo");
  if (!strip || !moduloFiltroEl) return;

  strip.querySelectorAll(".modulo-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      strip.querySelectorAll(".modulo-pill").forEach((b) =>
        b.classList.remove("active")
      );
      btn.classList.add("active");

      const modulo = (btn.dataset.modulo || "").toUpperCase();
      moduloFiltroEl.value = modulo;

      if (usuarioSelecionadoId) {
        carregarPermissoes();
      }
    });
  });
}

// quando o usuário digita manualmente no campo de módulo, sincroniza pill
function syncPillFromText() {
  const strip = document.getElementById("modulosStrip");
  const moduloFiltroEl = document.getElementById("fModulo");
  if (!strip || !moduloFiltroEl) return;

  const valor = (moduloFiltroEl.value || "").trim().toUpperCase();
  let alguma = false;

  strip.querySelectorAll(".modulo-pill").forEach((btn) => {
    const modulo = (btn.dataset.modulo || "").toUpperCase();
    if (valor && modulo === valor) {
      btn.classList.add("active");
      alguma = true;
    } else if (!valor && !modulo) {
      btn.classList.add("active");
      alguma = true;
    } else {
      btn.classList.remove("active");
    }
  });

  if (!alguma) {
    strip
      .querySelectorAll(".modulo-pill")
      .forEach((b) => b.classList.remove("active"));
  }
}

// ================== SALVAR PERMISSÕES ==================

async function salvarPermissoes() {
  if (!usuarioSelecionadoId) {
    alert("Selecione um usuário antes de salvar.");
    return;
  }

  const tbody = document.getElementById("tbodyPermissoes");
  if (!tbody) return;

  const permissoes = [];
  tbody.querySelectorAll(".nivel-checkbox").forEach((chk) => {
    const telaId = parseInt(chk.dataset.telaId, 10);
    const nivelAcesso = chk.checked ? "W" : "N"; // marcado = W, desmarcado = N
    if (!Number.isNaN(telaId)) {
      permissoes.push({ telaId, nivelAcesso });
    }
  });

  setLoadingRegras(true);
  try {
    await apiPutRegras(
      `/usuarios/${usuarioSelecionadoId}/telas-permissoes`,
      { permissoes }
    );
    alert("Permissões salvas com sucesso.");
    await carregarPermissoes();
  } catch (e) {
    console.error("[REGRAS][salvarPermissoes] Erro:", e);
    alert("Erro ao salvar permissões. Veja o console para detalhes.");
  } finally {
    setLoadingRegras(false);
  }
}

// ================== UTILS ==================

function limparTabelaPermissoes() {
  const tbody = document.getElementById("tbodyPermissoes");
  const info = document.getElementById("infoRegistrosRegras");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="regras-empty">
          Selecione um usuário para começar.
        </td>
      </tr>
    `;
  }
  if (info) {
    info.textContent = "Selecione um usuário para ver as permissões.";
  }
  atualizarResumoPermissoes();
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}