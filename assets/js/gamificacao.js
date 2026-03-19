console.log("[GAMIF] Script gamificacao.js carregado.");

function getApiBaseGamif() {
  if (typeof window !== "undefined" && window.APIBASE) {
    return window.APIBASE;
  }
  return "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
}

// Loader global baseado em aria-hidden + display
function showLoader() {
  const overlay = document.getElementById("loaderOverlay");
  if (!overlay) return;
  overlay.setAttribute("aria-hidden", "false");
  overlay.style.display = "flex";
}

function hideLoader() {
  const overlay = document.getElementById("loaderOverlay");
  if (!overlay) return;
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.display = "none";
}

function getUsuarioObrigatorioGamif() {
  const user =
    typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  console.log("[GAMIF][getUsuarioObrigatorio] user:", user && {
    email: user.email,
    nome: user.nome,
    tipo: user.tipo,
    perfis: user.perfis,
  });

  if (!user || !user.email) {
    console.warn("[GAMIF][getUsuarioObrigatorio] Sem usuário, redirecionando.");
    window.location.href = "/index.html";
    return null;
  }
  return user;
}

function getAuthHeadersGamif() {
  const user = getUsuarioObrigatorioGamif();
  if (!user) {
    console.warn(
      "[GAMIF][getAuthHeadersGamif] Sem usuário, retornando headers mínimos."
    );
    return { "Content-Type": "application/json" };
  }

  let headers;

  if (typeof getAuthHeadersCalendario === "function") {
    headers = getAuthHeadersCalendario();
  } else {
    headers = { "Content-Type": "application/json" };
    try {
      const token =
        (window.sessionStorage && sessionStorage.getItem("authToken")) || null;
      if (token) {
        headers["Authorization"] = "Bearer " + token;
      } else {
        console.warn(
          "[GAMIF][getAuthHeadersGamif] authToken ausente no sessionStorage."
        );
      }
    } catch (e) {
      console.warn(
        "[GAMIF][getAuthHeadersGamif] Erro ao ler authToken:",
        e
      );
    }
  }

  headers["x-usuario-email"] = user.email;

  const safe = { ...headers };
  if (safe.Authorization) safe.Authorization = "Bearer ****";
  console.log("[GAMIF][getAuthHeadersGamif] Headers finais:", safe);

  return headers;
}

async function apiGetGamif(path) {
  const base = getApiBaseGamif();
  if (!base) {
    console.error("[GAMIF][apiGetGamif] API base não definida.");
    throw new Error("API base não configurada");
  }

  const url = base + path;
  console.log("[GAMIF][apiGetGamif] URL:", url);

  const headers = getAuthHeadersGamif();
  const safe = { ...headers };
  if (safe.Authorization) safe.Authorization = "Bearer ****";
  console.log("[GAMIF][apiGetGamif] Headers enviados:", safe);

  let resp;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers,
    });
  } catch (e) {
    console.error("[GAMIF][apiGetGamif] Erro de rede/fetch:", e);
    throw new Error("Falha na comunicação com o servidor (gamificação)");
  }

  console.log("[GAMIF][apiGetGamif] HTTP status:", resp.status);

  if (!resp.ok) {
    let body = "";
    try {
      body = await resp.text();
    } catch (e) {
      console.warn("[GAMIF][apiGetGamif] Erro ao ler corpo:", e);
    }
    console.error(
      "[GAMIF][apiGetGamif] Resposta não OK:",
      "status=", resp.status,
      "body=", body
    );
    if (resp.status === 401) {
      console.warn(
        "[GAMIF][apiGetGamif] 401 - não autorizado (token/e-mail ausente ou inválido)."
      );
    }
    throw new Error("HTTP " + resp.status + " ao chamar " + path);
  }

  try {
    const json = await resp.json();
    console.log("[GAMIF][apiGetGamif] JSON recebido:", json);
    return json;
  } catch (e) {
    console.error("[GAMIF][apiGetGamif] Erro ao fazer parse JSON:", e);
    throw new Error("Erro ao interpretar resposta JSON");
  }
}

let gamificacaoBruta = [];
let linhasFiltradas = [];

window.addEventListener("DOMContentLoaded", () => {
  console.log("[GAMIF] DOMContentLoaded");

  const user = getUsuarioObrigatorioGamif();
  if (!user) return;

  const nomeEl = document.getElementById("gamifUserNome");
  const emailEl = document.getElementById("gamifUserEmail");
  if (nomeEl) nomeEl.textContent = user.nome || "Usuário VISYA";
  if (emailEl) emailEl.textContent = user.email || "";

  const btnBuscar = document.getElementById("btnBuscar");
  const btnLimpar = document.getElementById("btnLimpar");

  if (btnBuscar) btnBuscar.addEventListener("click", carregarGamificacao);
  if (btnLimpar) btnLimpar.addEventListener("click", limparFiltros);

  document
    .getElementById("fVendedorNome")
    ?.addEventListener("input", aplicarFiltroLocal);

  inicializarPeriodoPadrao();
});

function inicializarPeriodoPadrao() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;

  const fMes = document.getElementById("fMes");
  const fAno = document.getElementById("fAno");

  if (fMes) fMes.value = String(mes);
  if (fAno) fAno.value = String(ano);

  carregarGamificacao();
}

function limparFiltros() {
  const fMes = document.getElementById("fMes");
  const fAno = document.getElementById("fAno");
  const fVendedorId = document.getElementById("fVendedorId");
  const fVendedorNome = document.getElementById("fVendedorNome");

  if (fMes) fMes.value = "";
  if (fAno) fAno.value = "";
  if (fVendedorId) fVendedorId.value = "";
  if (fVendedorNome) fVendedorNome.value = "";

  const tbody = document.getElementById("tbodyGamificacao");
  const infoRegistros = document.getElementById("infoRegistros");
  const infoPeriodo = document.getElementById("infoPeriodo");

  gamificacaoBruta = [];
  linhasFiltradas = [];

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="empty-state">
          Selecione mês/ano e clique em Atualizar.
        </td>
      </tr>
    `;
  }
  if (infoRegistros) infoRegistros.textContent = "Mostrando 0 de 0 vendedores";
  if (infoPeriodo) infoPeriodo.textContent = "Período não definido";

  atualizarCardsResumo([]);
}

async function carregarGamificacao() {
  const tbody = document.getElementById("tbodyGamificacao");
  const infoRegistros = document.getElementById("infoRegistros");
  const infoPeriodo = document.getElementById("infoPeriodo");

  const fMes = document.getElementById("fMes");
  const fAno = document.getElementById("fAno");
  const fVendedorId = document.getElementById("fVendedorId");

  if (!tbody) return;

  const mesStr = fMes?.value || "";
  const anoStr = fAno?.value || "";

  const mes = mesStr ? parseInt(mesStr, 10) : NaN;
  const ano = anoStr ? parseInt(anoStr, 10) : NaN;

  if (!mesStr || !anoStr || Number.isNaN(mes) || Number.isNaN(ano)) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="empty-state">
          Selecione mês e ano para buscar.
        </td>
      </tr>
    `;
    if (infoRegistros) infoRegistros.textContent = "Mostrando 0 de 0 vendedores";
    if (infoPeriodo) infoPeriodo.textContent = "Período não definido";
    atualizarCardsResumo([]);
    return;
  }

  const mesPad = String(mes).padStart(2, "0");
  const inicio = `${ano}-${mesPad}-01`;
  const ultimoDiaDate = new Date(ano, mes, 0);
  const fim = ultimoDiaDate.toISOString().substring(0, 10);

  const vendedorIdRaw = fVendedorId?.value.trim() || "";
  const vendedorId = vendedorIdRaw ? parseInt(vendedorIdRaw, 10) : null;

  tbody.innerHTML = `
    <tr>
      <td colspan="10" class="empty-state">
        Carregando dados de gamificação...
      </td>
    </tr>
  `;
  if (infoRegistros) infoRegistros.textContent = "Carregando...";
  if (infoPeriodo) infoPeriodo.textContent = `Período: ${inicio} até ${fim}`;

  const params = new URLSearchParams();
  params.set("inicio", inicio);
  params.set("fim", fim);
  if (vendedorId && !Number.isNaN(vendedorId)) {
    params.set("vendedorId", String(vendedorId));
  }

  const path = `/gamificacao?${params.toString()}`;

  showLoader();
  try {
    const data = await apiGetGamif(path);

    const lista = data && Array.isArray(data.gamificacao)
      ? data.gamificacao
      : [];

    gamificacaoBruta = lista;

    if (!lista.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="empty-state">
            Nenhum dado retornado para o período/filtro informados.
          </td>
        </tr>
      `;
      if (infoRegistros) infoRegistros.textContent = "Mostrando 0 de 0 vendedores";
      atualizarCardsResumo([]);
      return;
    }

    aplicarFiltroLocal();
  } catch (e) {
    console.error("[GAMIF] Erro ao carregar gamificação:", e);
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="empty-state">
          Erro ao carregar dados de gamificação (API). Tente novamente mais tarde.
        </td>
      </tr>
    `;
    if (infoRegistros) infoRegistros.textContent = "Erro ao carregar";
    if (infoPeriodo) infoPeriodo.textContent = "Período não definido";
    atualizarCardsResumo([]);
  } finally {
    hideLoader();
  }
}

function aplicarFiltroLocal() {
  const tbody = document.getElementById("tbodyGamificacao");
  const infoRegistros = document.getElementById("infoRegistros");

  if (!tbody) return;

  const filtroNome = (document.getElementById("fVendedorNome")?.value || "")
    .toLowerCase()
    .trim();

  let linhas = gamificacaoBruta.slice();

  if (filtroNome) {
    linhas = linhas.filter((r) => {
      const nome = String(r.nmVendedor || r.NMVENDEDOR || "").toLowerCase();
      return nome.includes(filtroNome);
    });
  }

  linhasFiltradas = linhas;

  if (!linhasFiltradas.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="empty-state">
          Nenhum vendedor após aplicar os filtros.
        </td>
      </tr>
    `;
    if (infoRegistros) infoRegistros.textContent = "Mostrando 0 de 0 vendedores";
    atualizarCardsResumo([]);
    return;
  }

  let html = "";

  for (const r of linhasFiltradas) {
    const idVendedor = r.idVendedor ?? r.IDVENDEDOR ?? "";
    const nmVendedor = r.nmVendedor ?? r.NMVENDEDOR ?? "";

    const diasSemRota = Number(r.diasSemRota ?? 0);
    const qtdeAtivRuins = Number(r.qtdeAtividadesRuins ?? 0);
    const diasComAtivRuim = Number(r.diasComAtivRuim ?? 0);
    const qtdePendentes = Number(r.qtdeAtividadesPendentes ?? 0);
    const diasComPendencia = Number(r.diasComPendencia ?? 0);
    const totalPontosPerdidos = Number(r.totalPontosPerdidos ?? 0);
    const pontuacaoFinal = Number(r.pontuacaoFinal ?? 0);
    const classificacao = String(r.classificacao ?? "").trim();

    const classPillClass = getClassPillClass(classificacao);

    html += `
      <tr>
        <td>${escapeHtml(idVendedor)}</td>
        <td>${escapeHtml(nmVendedor)}</td>
        <td class="num">${diasSemRota}</td>
        <td class="num">${qtdeAtivRuins}</td>
        <td class="num">${diasComAtivRuim}</td>
        <td class="num">${qtdePendentes}</td>
        <td class="num">${diasComPendencia}</td>
        <td class="num">${totalPontosPerdidos}</td>
        <td class="num">${pontuacaoFinal}</td>
        <td>
          <span class="status-pill ${classPillClass}">
            ${escapeHtml(classificacao || "—")}
          </span>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;

  if (infoRegistros) {
    infoRegistros.textContent =
      "Mostrando " + linhasFiltradas.length + " vendedores";
  }

  atualizarCardsResumo(linhasFiltradas);
}

function atualizarCardsResumo(lista) {
  const cardPontuacaoMedia = document.getElementById("cardPontuacaoMedia");
  const cardPontuacaoMax = document.getElementById("cardPontuacaoMax");
  const cardPontuacaoMin = document.getElementById("cardPontuacaoMin");
  const cardQtdeVendedores = document.getElementById("cardQtdeVendedores");
  const cardMelhorVendedor = document.getElementById("cardMelhorVendedor");
  const cardPiorVendedor = document.getElementById("cardPiorVendedor");

  if (!lista || !lista.length) {
    if (cardPontuacaoMedia) cardPontuacaoMedia.textContent = "0,0";
    if (cardPontuacaoMax) cardPontuacaoMax.textContent = "0,0";
    if (cardPontuacaoMin) cardPontuacaoMin.textContent = "0,0";
    if (cardQtdeVendedores) cardQtdeVendedores.textContent = "0";
    if (cardMelhorVendedor) cardMelhorVendedor.textContent = "—";
    if (cardPiorVendedor) cardPiorVendedor.textContent = "—";
    return;
  }

  let soma = 0;
  let max = -Infinity;
  let min = Infinity;
  let melhor = null;
  let pior = null;

  for (const r of lista) {
    const score = Number(r.pontuacaoFinal ?? 0);
    soma += score;

    if (score > max) {
      max = score;
      melhor = r;
    }
    if (score < min) {
      min = score;
      pior = r;
    }
  }

  const media = soma / lista.length;

  if (cardPontuacaoMedia) cardPontuacaoMedia.textContent = media.toFixed(1);
  if (cardPontuacaoMax)
    cardPontuacaoMax.textContent = isFinite(max) ? max.toFixed(1) : "0,0";
  if (cardPontuacaoMin)
    cardPontuacaoMin.textContent = isFinite(min) ? min.toFixed(1) : "0,0";
  if (cardQtdeVendedores)
    cardQtdeVendedores.textContent = String(lista.length);

  if (cardMelhorVendedor) {
    const nome = melhor?.nmVendedor ?? melhor?.NMVENDEDOR ?? "";
    cardMelhorVendedor.textContent = nome ? `Melhor: ${nome}` : "—";
  }
  if (cardPiorVendedor) {
    const nome = pior?.nmVendedor ?? pior?.NMVENDEDOR ?? "";
    cardPiorVendedor.textContent = nome ? `Pior: ${nome}` : "—";
  }
}

function getClassPillClass(classificacao) {
  const c = String(classificacao || "").toLowerCase();
  if (c === "excelente") return "status-ok";
  if (c === "bom") return "status-ok";
  if (c === "regular") return "status-alerta";
  if (c === "crítico" || c === "critico") return "status-critico";
  return "";
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}