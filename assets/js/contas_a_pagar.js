// ================== CONFIGURAÇÕES GERAIS ==================
let EMPRESA_ATUAL = null;
let mesAtual = new Date();
let _idParaExcluir = null;
let _recorrenciaParaExcluir = null;
const ADMIN_PASSWORD = "admin123";

if (!window.API_BASE) {
  window.API_BASE =
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
}
if (!window.WHATSAPP_BASE) {
  window.WHATSAPP_BASE = "http://172.18.4.12:3000";
}

// ================== LOADER ==================
function showLoader() {
  const el = document.getElementById("loaderOverlay");
  if (!el) return;
  el.setAttribute("aria-hidden", "false");
}

function hideLoader() {
  const el = document.getElementById("loaderOverlay");
  if (!el) return;
  el.setAttribute("aria-hidden", "true");
}

// ================== AUTH / API ==================
function getAuthHeadersCalendario() {
  try {
    const token =
      (window.sessionStorage && sessionStorage.getItem("authToken")) || null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;

    const user =
      typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
    if (user && user.email) headers["x-usuario-email"] = user.email;

    return headers;
  } catch (e) {
    console.warn("[AUTH] erro ao montar headers:", e);
    return { "Content-Type": "application/json" };
  }
}

async function apiGet(path) {
  const url = `${window.API_BASE}${path}`;
  console.log("[API GET] URL:", url);
  const resp = await fetch(url, {
    method: "GET",
    headers: getAuthHeadersCalendario()
  });
  console.log("[API GET] status:", resp.status);
  if (!resp.ok) {
    const txt = await resp.text();
    console.error("[API GET] erro body:", txt);
    throw new Error(`GET ${path} status ${resp.status}`);
  }
  return resp.json();
}
async function apiPost(path, body) {
  const url = `${window.API_BASE}${path}`;
  console.log("[API POST] URL:", url, "body:", body);
  const resp = await fetch(url, {
    method: "POST",
    headers: getAuthHeadersCalendario(),
    body: JSON.stringify(body)
  });
  console.log("[API POST] status:", resp.status);
  if (!resp.ok) {
    const txt = await resp.text();
    console.error("[API POST] erro body:", txt);
    throw new Error(`POST ${path} status ${resp.status}`);
  }
  return resp.json();
}
async function apiPut(path, body) {
  const url = `${window.API_BASE}${path}`;
  console.log("[API PUT] URL:", url, "body:", body);
  const resp = await fetch(url, {
    method: "PUT",
    headers: getAuthHeadersCalendario(),
    body: JSON.stringify(body)
  });
  console.log("[API PUT] status:", resp.status);
  if (!resp.ok) {
    const txt = await resp.text();
    console.error("[API PUT] erro body:", txt);
    throw new Error(`PUT ${path} status ${resp.status}`);
  }
  return resp.json();
}
async function apiDelete(path, body) {
  const url = `${window.API_BASE}${path}`;
  console.log("[API DELETE] URL:", url, "body:", body);
  const resp = await fetch(url, {
    method: "DELETE",
    headers: getAuthHeadersCalendario(),
    body: body ? JSON.stringify(body) : null
  });
  console.log("[API DELETE] status:", resp.status);
  if (!resp.ok) {
    const txt = await resp.text();
    console.error("[API DELETE] erro body:", txt);
    throw new Error(`DELETE ${path} status ${resp.status}`);
  }
}

// ================== ESTADO / FILTROS ==================
window._contatosSelecionadosTemp = [];
window._contatos = [];
window._despesas = [];
window._despesasFiltradas = [];

let filtroBuscaTexto = "";
let filtroStatus = "todos";
let filtroDataInicio = "";
let filtroDataFim = "";
let _ultimoValorBusca = "";

// ================== UTILS ==================
function dataISO(d) {
  return d.toISOString().slice(0, 10);
}
function formatarDataBR(isoCompleta) {
  if (!isoCompleta) return "";
  const soData = isoCompleta.substring(0, 10);
  return soData.split("-").reverse().join("/");
}
function formatarNumeroBR(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// ================== INIT ==================
async function initPagina() {
  console.log("========== initPagina INÍCIO ==========");
  const user =
    typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  console.log("[INIT] user:", user);
  if (!user) {
    window.location.href = "../index.html";
    return;
  }

  const emp = sessionStorage.getItem("empresaSelecionada");
  console.log("[INIT] empresaSelecionada:", emp);
  EMPRESA_ATUAL = emp ? Number(emp) : null;
  console.log("[INIT] EMPRESA_ATUAL =", EMPRESA_ATUAL);

  const userNameEl = document.getElementById("userName");
  if (userNameEl) {
    userNameEl.textContent = user.nome || user.email || "Usuário";
  }

  const inpBusca = document.getElementById("buscaTexto");
  if (inpBusca) {
    inpBusca.value = "";
    inpBusca.setAttribute("readonly", "readonly");
    setTimeout(() => {
      inpBusca.removeAttribute("readonly");
    }, 500);
    inpBusca.addEventListener("input", ev => {
      onChangeBuscaTexto(ev.target.value);
    });
  }

  const selStatus = document.getElementById("filtroStatus");
  if (selStatus) selStatus.value = "todos";

  const dtIni = document.getElementById("filtroDataInicio");
  const dtFim = document.getElementById("filtroDataFim");
  if (dtIni) dtIni.value = "";
  if (dtFim) dtFim.value = "";

  await initCalendario();
  console.log("========== initPagina FIM ==========");
}

// ================== CALENDÁRIO / CARREGAMENTO ==================
async function initCalendario() {
  console.log("========== initCalendario ==========");
  showLoader();
  try {
    await carregarContatos();

    const ano = mesAtual.getFullYear();
    const mesNumero = mesAtual.getMonth() + 1;
    const mesStr = `${ano}-${String(mesNumero).padStart(2, "0")}`;
    console.log(
      "[initCalendario] mês referência:",
      mesStr,
      "empresa:",
      EMPRESA_ATUAL
    );

    let despesasManuais = [];
    let despesasFinanceiro = [];

    // MANUAIS
    try {
      const urlPath = `/despesas?mes=${mesStr}&empresa=${EMPRESA_ATUAL}`;
      console.log("[initCalendario] chamando", urlPath);
      const dados = await apiGet(urlPath);
      console.log("[initCalendario] resposta /despesas =", dados);

      despesasManuais = (dados.despesas || []).map(d => {
        const dtISO = (d.data_vencimento || "").slice(0, 10);
        return {
          id: d.id,
          empresa: d.empresa || EMPRESA_ATUAL,
          descricao: d.descricao,
          vencimento: dtISO,
          status: d.status || "pendente",
          recorrente: d.recorrencia_tipo === "mensal" ? "mensal" : "nao",
          responsaveis: Array.isArray(d.contatos) ? d.contatos : [],
          tiposAviso: Array.isArray(d.tipos_aviso) ? d.tipos_aviso : ["3"],
          dataPagamento: null,
          excluido: false,
          origem: "manual",
          logDetalhado: null
        };
      });
    } catch (e) {
      console.error("Erro ao carregar despesas manuais:", e);
      despesasManuais = [];
    }

    // FINANCEIRO
    try {
      console.log("[initCalendario] chamando /despesas-financeiro");
      const dadosFin = await apiGet(
        `/despesas-financeiro?empresa=${EMPRESA_ATUAL}`
      );
      console.log("[initCalendario] resposta /despesas-financeiro =", dadosFin);

      const todasFin = Array.isArray(dadosFin.despesas)
        ? dadosFin.despesas
        : [];

      const filtradas = todasFin.filter(d => {
        const dtVenc = d.DTVENC ? d.DTVENC.slice(0, 10) : null;
        if (!dtVenc) return false;

        const anoV = dtVenc.substring(0, 4);
        const mesV = dtVenc.substring(5, 7);
        const mesComparar = `${anoV}-${mesV}`;
        if (mesComparar !== mesStr) return false;

        const cod = Number(String(d.CODEMP ?? "").trim());

        // EMPRESA_ATUAL numérica; se estiver entre 30–39, enxerga todo range 30–39
        let pertence = false;
        if (
          Number.isFinite(EMPRESA_ATUAL) &&
          EMPRESA_ATUAL >= 30 &&
          EMPRESA_ATUAL <= 39
        ) {
          pertence = Number.isFinite(cod) && cod >= 30 && cod <= 39;
        } else {
          pertence = EMPRESA_ATUAL == null ? true : cod === EMPRESA_ATUAL;
        }

        console.log(
          "[FIN-FILTRO]",
          "EMPRESA_ATUAL:",
          EMPRESA_ATUAL,
          "NUFIN:",
          d.NUFIN,
          "CODEMP(raw):",
          d.CODEMP,
          "CODEMP(num):",
          cod,
          "=> pertence?",
          pertence
        );

        return pertence;
      });

      console.log(
        "[initCalendario] financeiro filtrado p/ empresa",
        EMPRESA_ATUAL,
        "qtd:",
        filtradas.length
      );

      despesasFinanceiro = filtradas.map(d => {
        const dtVenc = d.DTVENC ? d.DTVENC.slice(0, 10) : null;
        const dtBaixa = d.DHBAIXA ? d.DHBAIXA.slice(0, 10) : null;
        const status = dtBaixa ? "pago" : "pendente";

        const numeroDespesa = d.NUFIN ? `(${d.NUFIN}) ` : "";
        const natureza = d.NOME_NATUREZA || "Despesa";
        const historico = d.HISTORICO || "";
        const hojeISO2 = new Date().toISOString().slice(0, 10);

        return {
          id: d.Id,
          empresa: EMPRESA_ATUAL,
          descricao: `${natureza} - ${numeroDespesa}${historico}`.trim(),
          vencimento: dtVenc,
          status,
          recorrente: "nao",
          responsaveis: [],
          tiposAviso: ["3"],
          dataPagamento: dtBaixa || null,
          excluido: false,
          origem: "sankhya",
          logDetalhado: {
            criadoEm: hojeISO2,
            baixadoEm: dtBaixa || null,
            origem: "Sankhya",
            financeiro: { ...d }
          }
        };
      });
    } catch (e) {
      console.error("Erro ao carregar /despesas-financeiro:", e);
      despesasFinanceiro = [];
    }

    window._despesas = [...despesasManuais, ...despesasFinanceiro];

    aplicarFiltros();
    renderizarCalendario();
  } catch (e) {
    console.error("Erro em initCalendario:", e);
  } finally {
    hideLoader();
  }
}

// ================== CONTATOS ==================
async function carregarContatos() {
  const empresa = EMPRESA_ATUAL;
  try {
    const path = `/contatos?empresa=${encodeURIComponent(empresa)}`;
    console.log("[carregarContatos] GET", window.API_BASE + path);
    const data = await apiGet(path);
    console.log("[carregarContatos] json:", data);
    window._contatos = Array.isArray(data.contatos) ? data.contatos : [];
  } catch (e) {
    console.error("Falha ao chamar /contatos:", e);
    window._contatos = [];
  }

  preencherSelectContatos();
}

function preencherSelectContatos() {
  const sel = document.getElementById("contatosSelect");
  if (!sel) return;

  sel.innerHTML = "";

  const optDefault = document.createElement("option");
  optDefault.value = "";
  optDefault.textContent = "Selecionar contato...";
  sel.appendChild(optDefault);

  const contatos = window._contatos || [];
  contatos.forEach((c, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = `${c.nome} (${c.telefone})`;
    sel.appendChild(opt);
  });
}

function adicionarContatoSelecionado() {
  const sel = document.getElementById("contatosSelect");
  if (!sel) return;

  const idxStr = sel.value;
  if (idxStr === "") return;

  const contatos = window._contatos || [];
  const idx = Number(idxStr);
  const contato = contatos[idx];
  if (!contato) return;

  const jaExiste = window._contatosSelecionadosTemp.some(
    c => c.telefone === contato.telefone
  );
  if (!jaExiste) {
    window._contatosSelecionadosTemp.push({
      nome: contato.nome,
      telefone: contato.telefone,
      tipo: "responsavel"
    });
    renderizarChipsContatosSelecionados();
  }

  sel.value = "";
}

function adicionarContatoRapido() {
  const extraNome = document.getElementById("extraNome").value.trim();
  const extraTelefone =
    document.getElementById("extraTelefone").value.trim();
  if (!extraTelefone) {
    alert("Informe o telefone do contato rápido.");
    return;
  }

  const jaExiste = window._contatosSelecionadosTemp.some(
    c => c.telefone === extraTelefone
  );
  if (!jaExiste) {
    window._contatosSelecionadosTemp.push({
      nome: extraNome || "Contato",
      telefone: extraTelefone,
      tipo: "responsavel"
    });
    renderizarChipsContatosSelecionados();
  }

  document.getElementById("extraNome").value = "";
  document.getElementById("extraTelefone").value = "";
}

function renderizarChipsContatosSelecionados() {
  const container = document.getElementById("contatosSelecionados");
  if (!container) return;

  container.innerHTML = "";

  const lista = window._contatosSelecionadosTemp || [];
  if (!lista.length) return;

  lista.forEach((c, idx) => {
    const chip = document.createElement("div");
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";
    chip.style.gap = "4px";
    chip.style.padding = "2px 8px 2px 10px";
    chip.style.borderRadius = "999px";
    chip.style.fontSize = "0.75rem";
    chip.style.background = "#0f172a";
    chip.style.border = "1px solid #4b5563";
    chip.style.color = "#e5e7eb";

    const spanTxt = document.createElement("span");
    spanTxt.textContent = `${c.nome} (${c.telefone})`;

    const btnTipo = document.createElement("button");
    btnTipo.type = "button";
    btnTipo.style.border = "none";
    btnTipo.style.borderRadius = "999px";
    btnTipo.style.padding = "1px 6px";
    btnTipo.style.fontSize = "0.7rem";
    btnTipo.style.cursor = "pointer";
    btnTipo.style.background =
      c.tipo === "informativo" ? "#1d4ed8" : "#16a34a";
    btnTipo.style.color = "#f9fafb";
    btnTipo.textContent =
      c.tipo === "informativo" ? "Informar" : "Responsável";
    btnTipo.onclick = () => {
      const atual = window._contatosSelecionadosTemp[idx];
      if (!atual) return;
      atual.tipo =
        atual.tipo === "informativo" ? "responsavel" : "informativo";
      renderizarChipsContatosSelecionados();
    };

    const btnX = document.createElement("button");
    btnX.type = "button";
    btnX.textContent = "✕";
    btnX.style.border = "none";
    btnX.style.background = "transparent";
    btnX.style.color = "#f97316";
    btnX.style.cursor = "pointer";
    btnX.style.fontSize = "0.8rem";
    btnX.onclick = () => removerContatoChip(idx);

    chip.appendChild(spanTxt);
    chip.appendChild(btnTipo);
    chip.appendChild(btnX);

    container.appendChild(chip);
  });
}

function removerContatoChip(index) {
  if (!Array.isArray(window._contatosSelecionadosTemp)) return;
  window._contatosSelecionadosTemp.splice(index, 1);
  renderizarChipsContatosSelecionados();
}

// ================== FILTROS ==================
function aplicarFiltros() {
  if (!Array.isArray(window._despesas)) {
    window._despesasFiltradas = [];
    return;
  }
  const hojeISO = dataISO(new Date());

  window._despesasFiltradas = window._despesas.filter(d => {
    if (EMPRESA_ATUAL != null && d.empresa !== EMPRESA_ATUAL) return false;
    if (d.excluido) return false;

    if (filtroBuscaTexto) {
      const texto = `${d.descricao || ""}`.toLowerCase();
      if (!texto.includes(filtroBuscaTexto)) return false;
    }

    if (filtroDataInicio && d.vencimento && d.vencimento < filtroDataInicio) {
      return false;
    }
    if (filtroDataFim && d.vencimento && d.vencimento > filtroDataFim) {
      return false;
    }

    if (filtroStatus === "pago" && d.status !== "pago") return false;
    if (filtroStatus === "pendente" && d.status !== "pendente") return false;
    if (filtroStatus === "vencido") {
      if (d.status === "pago") return false;
      if (!d.vencimento || d.vencimento >= hojeISO) return false;
    }
    if (filtroStatus === "hoje") {
      if (d.status === "pago") return false;
      if (d.vencimento !== hojeISO) return false;
    }

    return true;
  });

  console.log(
    "[aplicarFiltros] total:",
    window._despesas.length,
    "filtradas:",
    window._despesasFiltradas.length,
    "empresa:",
    EMPRESA_ATUAL
  );
}

function onChangeBuscaTexto(value) {
  const novo = (value || "").toLowerCase();

  if (!novo) {
    filtroBuscaTexto = "";
    _ultimoValorBusca = "";
    showLoader();
    try {
      aplicarFiltros();
      renderizarCalendario();
    } finally {
      hideLoader();
    }
    return;
  }

  if (novo === _ultimoValorBusca) return;

  filtroBuscaTexto = novo;
  _ultimoValorBusca = novo;

  showLoader();
  try {
    aplicarFiltros();
    renderizarCalendario();
  } finally {
    hideLoader();
  }
}

function onChangeFiltroStatus(value) {
  filtroStatus = value || "todos";
  showLoader();
  try {
    aplicarFiltros();
    renderizarCalendario();
  } finally {
    hideLoader();
  }
}

function onChangeFiltroPeriodo() {
  filtroDataInicio =
    document.getElementById("filtroDataInicio")?.value || "";
  filtroDataFim = document.getElementById("filtroDataFim")?.value || "";
  showLoader();
  try {
    aplicarFiltros();
    renderizarCalendario();
  } finally {
    hideLoader();
  }
}

function limparFiltros() {
  filtroBuscaTexto = "";
  filtroStatus = "todos";
  filtroDataInicio = "";
  filtroDataFim = "";
  _ultimoValorBusca = "";

  const inpBusca = document.getElementById("buscaTexto");
  const selStatus = document.getElementById("filtroStatus");
  const dtIni = document.getElementById("filtroDataInicio");
  const dtFim = document.getElementById("filtroDataFim");

  if (inpBusca) inpBusca.value = "";
  if (selStatus) selStatus.value = "todos";
  if (dtIni) dtIni.value = "";
  if (dtFim) dtFim.value = "";

  showLoader();
  try {
    aplicarFiltros();
    renderizarCalendario();
  } finally {
    hideLoader();
  }
}

// ================== NAVEGAÇÃO MÊS ==================
function formatarMesAno(date) {
  const meses = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro"
  ];
  return meses[date.getMonth()] + " de " + date.getFullYear();
}
function mudarMes(delta) {
  mesAtual.setMonth(mesAtual.getMonth() + delta);
  console.log("[mudarMes] novo mesAtual:", mesAtual);

  filtroBuscaTexto = "";
  _ultimoValorBusca = "";
  const inpBusca = document.getElementById("buscaTexto");
  if (inpBusca) inpBusca.value = "";

  initCalendario();
}
// ================== GRID DO CALENDÁRIO ==================
function ordenarDespesas(despesas, hojeISO) {
  return (despesas || []).slice().sort((a, b) => {
    const aPag = a.status === "pago";
    const bPag = b.status === "pago";
    const aVencida = a.vencimento && a.vencimento < hojeISO && !aPag;
    const bVencida = b.vencimento && b.vencimento < hojeISO && !bPag;
    const aHoje = a.vencimento === hojeISO && !aPag;
    const bHoje = b.vencimento === hojeISO && !bPag;

    if (aVencida && !bVencida) return -1;
    if (!aVencida && bVencida) return 1;

    if (aHoje && !bHoje) return -1;
    if (!aHoje && bHoje) return 1;

    if (!aPag && bPag) return -1;
    if (aPag && !bPag) return 1;

    return (a.descricao || "").localeCompare(b.descricao || "");
  });
}

function injetarDespesasFakeDomingo(ano, mes) {
  // cópia rasa para não mutar o array original de referência
  let lista = (window._despesasFiltradas || []).slice();

  const primeiroDia = new Date(ano, mes, 1);
  const ultimoDia = new Date(ano, mes + 1, 0);

  for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
    const dataAtual = new Date(ano, mes, dia);
    const ehDomingo = dataAtual.getDay() === 0;
    if (!ehDomingo) continue;

    const dataStr = dataISO(dataAtual);

    const temReal = lista.some(
      d => d.vencimento === dataStr && d.origem !== "fake"
    );
    if (temReal) continue;

    lista.push({
      id: `fake-${dataStr}`,
      descricao: "",
      vencimento: dataStr,
      status: "pendente",
      origem: "fake",
      responsaveis: [],
      tiposAviso: [],
      dataPagamento: null,
      excluido: false
    });
  }

  return lista;
}

function renderizarCalendario() {
  console.log("========== renderizarCalendario ==========");
  const titulo = document.getElementById("tituloMes");
  const grid = document.getElementById("gridDias");
  if (!grid) return;

  grid.innerHTML = "";

  const ano = mesAtual.getFullYear();
  const mes = mesAtual.getMonth();

  if (titulo) titulo.textContent = formatarMesAno(mesAtual);

  const primeiroDia = new Date(ano, mes, 1);
  const ultimoDia = new Date(ano, mes + 1, 0);
  const offsetSemana = primeiroDia.getDay();

  for (let i = 0; i < offsetSemana; i++) {
    const vazio = document.createElement("div");
    vazio.className = "day-cell";
    grid.appendChild(vazio);
  }

  const hojeISO = dataISO(new Date());

  // usa lista com fakes injetadas para domingos vazios
  const despesasEmpresa = injetarDespesasFakeDomingo(ano, mes);

  console.log(
    "[renderizarCalendario] total _despesasFiltradas (c/ fake):",
    despesasEmpresa.length,
    "empresa:",
    EMPRESA_ATUAL
  );

  for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
    const cell = document.createElement("div");
    cell.className = "day-cell";

    const dataAtual = new Date(ano, mes, dia);
    const dataStr = dataISO(dataAtual);

    cell.onclick = () => abrirModalDia(dataStr);

    const numero = document.createElement("div");
    numero.className = "day-number";
    numero.textContent = dia;
    cell.appendChild(numero);

    const eventosDiv = document.createElement("div");
    eventosDiv.className = "day-events";

    let despesasDoDia = despesasEmpresa.filter(d => d.vencimento === dataStr);
    despesasDoDia = ordenarDespesas(despesasDoDia, hojeISO);

    const maxMostrar = 4;
    const qtd = despesasDoDia.length;
    const mostrar = despesasDoDia.slice(0, maxMostrar);

    mostrar.forEach(despesa => {
      const pill = document.createElement("div");

      // Se for fake, aplica classe especial totalmente “apagada”
      if (despesa.origem === "fake") {
        pill.className = "event-pill event-pill-fake";
        pill.textContent = ""; // nada visível
        // não adiciona tooltip nem clique
      } else {
        pill.className = "event-pill " + classeStatus(despesa, hojeISO);
        pill.textContent = despesa.descricao;

        pill.addEventListener("mouseenter", e => {
          showCalTooltip(despesa, e.clientX, e.clientY);
        });
        pill.addEventListener("mousemove", e => {
          showCalTooltip(despesa, e.clientX, e.clientY);
        });
        pill.addEventListener("mouseleave", () => {
          hideCalTooltip();
        });

        pill.onclick = e => {
          e.stopPropagation();
          abrirModalDia(dataStr, despesa.id);
        };
      }

      eventosDiv.appendChild(pill);
    });

    // “+X despesas” só considera reais
    const qtdReais = despesasDoDia.filter(d => d.origem !== "fake").length;
    if (qtdReais > maxMostrar) {
      const restante = qtdReais - maxMostrar;
      const mais = document.createElement("div");
      mais.className = "event-pill status-pendente";
      mais.textContent = `+${restante} despesas`;
      mais.onclick = e => {
        e.stopPropagation();
        abrirModalDia(dataStr);
      };
      eventosDiv.appendChild(mais);
    }

    cell.appendChild(eventosDiv);
    grid.appendChild(cell);
  }
}

function classeStatus(despesa, hojeISO) {
  if (despesa.status === "pago") return "status-pago";
  if (despesa.vencimento < hojeISO) return "status-vencida";
  if (despesa.vencimento === hojeISO) return "status-hoje";
  return "status-pendente";
}
// ================== TOOLTIP ==================
function getTooltipHtml(d) {
  if (!d.vencimento)
    return (d.descricao || "")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const dtVenc = d.vencimento.split("-").reverse().join("/");
  const partes = [];

  partes.push(
    `<div class="cal-tooltip-title">${(d.descricao || "Despesa")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")} – vencimento ${dtVenc}</div>`
  );

  if (d.status === "pago" && d.dataPagamento) {
    partes.push(
      `<div class="cal-tooltip-line">Situação: <strong>Pago em ${d.dataPagamento
        .split("-")
        .reverse()
        .join("/")}</strong></div>`
    );
  } else {
    partes.push(
      `<div class="cal-tooltip-line">Situação: <strong>${
        d.status === "pago" ? "Pago" : "Pendente"
      }</strong></div>`
    );
  }

  if (d.origem === "sankhya" && d.logDetalhado && d.logDetalhado.financeiro) {
    const f = d.logDetalhado.financeiro;

    if (f.NUFIN)
      partes.push(
        `<div class="cal-tooltip-line">Número da despesa (financeiro): <span>${String(
          f.NUFIN
        )
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</span></div>`
      );
    if (f.NOME_NATUREZA)
      partes.push(
        `<div class="cal-tooltip-line">Natureza: <span>${String(
          f.NOME_NATUREZA
        )
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</span></div>`
      );
    if (f.HISTORICO)
      partes.push(
        `<div class="cal-tooltip-line">Descrição da despesa: <span>${String(
          f.HISTORICO
        )
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</span></div>`
      );

    if (f.NOMEPARC || f.CODPARC) {
      const base = f.NOMEPARC || "Parceiro";
      const codparcStr = f.CODPARC ? ` (cód. ${f.CODPARC})` : "";
      partes.push(
        `<div class="cal-tooltip-line">Fornecedor / Cliente: <span>${String(
          base
        )
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}${codparcStr}</span></div>`
      );
    }

    if (f.VLRDESDOB != null) {
      partes.push(
        `<div class="cal-tooltip-line">Valor: <span>R$ ${formatarNumeroBR(
          f.VLRDESDOB
        )}</span></div>`
      );
    }
  }

  return partes.join("");
}

function showCalTooltip(despesa, x, y) {
  
  if (despesa.origem === "fake") return; // não mostra tooltip de fake
  const tooltip = document.getElementById("calTooltip");
  if (!tooltip) return;
  tooltip.innerHTML = getTooltipHtml(despesa);
  tooltip.style.display = "block";
  const offset = 16;
  tooltip.style.left = x + offset + "px";
  tooltip.style.top = y + offset + "px";
}
function hideCalTooltip() {
  const tooltip = document.getElementById("calTooltip");
  if (!tooltip) return;
  tooltip.style.display = "none";
}

// ================== MODAL DIA / DETALHES ==================
function abrirModalDia(dataISOstr, despesaId) {
  const modal = document.getElementById("modalDia");
  const listaContainer = document.getElementById("listaDiaContainer");
  const tituloModal = document.getElementById("tituloModalDia");
  if (!modal || !listaContainer || !tituloModal) return;

  const [ano, mes, dia] = dataISOstr.split("-");
  tituloModal.textContent = `Despesas de ${dia}/${mes}/${ano}`;

 let despesasDia = (window._despesasFiltradas || []).filter(
  d => d.vencimento === dataISOstr && d.origem !== "fake"
);
  if (despesaId != null) {
    despesasDia = despesasDia.filter(d => String(d.id) === String(despesaId));
  }

  listaContainer.innerHTML = "";
  if (!despesasDia.length) {
    const vazio = document.createElement("div");
    vazio.style.fontSize = "0.85rem";
    vazio.style.color = "#9ca3af";
    vazio.textContent = "Nenhuma despesa neste dia.";
    listaContainer.appendChild(vazio);
  } else {
    const hojeISO = dataISO(new Date());
    const ordenadas = ordenarDespesas(despesasDia, hojeISO);
    ordenadas.forEach(d => {
      const card = criarCardDespesa(d);
      listaContainer.appendChild(card);
    });
  }

  modal.style.display = "flex";
}
function fecharModalDia() {
  const modal = document.getElementById("modalDia");
  if (!modal) return;
  modal.style.display = "none";
}

function criarCardDespesa(d) {
  const hojeISO = dataISO(new Date());
  const card = document.createElement("div");
  card.className = "item-dia";

  const header = document.createElement("div");
  header.className = "item-dia-header";

  const esquerda = document.createElement("div");
  esquerda.style.display = "flex";
  esquerda.style.flexDirection = "column";
  esquerda.style.gap = "2px";

  const desc = document.createElement("div");
  desc.className = "item-dia-desc";
  desc.textContent = d.descricao || "Despesa";

  const info = document.createElement("div");
  info.className = "item-dia-email";
  info.textContent = `Vencimento: ${formatarDataBR(d.vencimento)}`;

  esquerda.appendChild(desc);
  esquerda.appendChild(info);

  const statusWrap = document.createElement("div");
  statusWrap.className = "item-dia-status";

  const dot = document.createElement("span");
  dot.className = "item-dia-status-dot";

  let label = "Pendente";
  if (d.status === "pago") {
    dot.classList.add("pago");
    label = "Pago";
  } else if (d.vencimento < hojeISO) {
    dot.classList.add("vencido");
    label = "Vencida";
  } else if (d.vencimento === hojeISO) {
    dot.classList.add("hoje");
    label = "Vence hoje";
  }

  const statusTexto = document.createElement("span");
  statusTexto.textContent = label;

  statusWrap.appendChild(dot);
  statusWrap.appendChild(statusTexto);

  header.appendChild(esquerda);
  header.appendChild(statusWrap);

  const detalhes = document.createElement("div");
  detalhes.className = "item-dia-log";

  if (d.origem === "sankhya" && d.logDetalhado && d.logDetalhado.financeiro) {
    const f = d.logDetalhado.financeiro;

    const colResumo = document.createElement("div");
    const colDatas = document.createElement("div");

    const tituloResumo = document.createElement("div");
    tituloResumo.className = "item-dia-log-section-title";
    tituloResumo.textContent = "Resumo";

    const tituloDatas = document.createElement("div");
    tituloDatas.className = "item-dia-log-section-title";
    tituloDatas.textContent = "Datas e documentos";

    colResumo.appendChild(tituloResumo);
    colDatas.appendChild(tituloDatas);

    const addLinha = (container, label, valor) => {
      if (valor == null || valor === "") return;
      const linha = document.createElement("div");
      linha.className = "item-dia-log-line";
      linha.innerHTML = `<span>${label}: </span><span class="item-dia-log-strong">${valor}</span>`;
      container.appendChild(linha);
    };

    addLinha(colResumo, "Nº despesa", f.NUFIN);
    addLinha(colResumo, "ID interno", f.Id);
    addLinha(colResumo, "Natureza", f.NOME_NATUREZA);
    addLinha(colResumo, "Histórico", f.HISTORICO || "—");

    let parceiro = null;
    if (f.NOMEPARC || f.CODPARC) {
      parceiro = `${f.NOMEPARC || "Parceiro"}${
        f.CODPARC ? ` (cód. ${f.CODPARC})` : ""
      }`;
    }
    addLinha(colResumo, "Fornecedor/Cliente", parceiro);

    let valorStr = null;
    if (f.VLRDESDOB != null) {
      valorStr = `R$ ${formatarNumeroBR(f.VLRDESDOB)}`;
    }
    addLinha(colResumo, "Valor da parcela", valorStr);

    addLinha(colResumo, "Cód. natureza", f.CODNAT);
    addLinha(colResumo, "Centro de custo", f.CODCENCUS);
    addLinha(colResumo, "Conta bancária/contábil", f.CODCTABCOINT);
    addLinha(colResumo, "Tipo título", f.CODTIPTIT);
    addLinha(colResumo, "Tipo operação", f.CODTIPOPER);
    addLinha(colResumo, "Empresa (Sankhya)", f.CODEMP);

    if (f.DTENTSAI) {
      addLinha(colDatas, "Entrada/Saída", formatarDataBR(f.DTENTSAI));
    }
    if (f.DTVENC) {
      addLinha(
        colDatas,
        "Vencimento financeiro",
        formatarDataBR(f.DTVENC)
      );
    }
    if (f.DHBAIXA) {
      const dataBaixa = f.DHBAIXA.substring(0, 10);
      const horaBaixa = f.DHBAIXA.substring(11, 19);
      addLinha(
        colDatas,
        "Baixa financeira",
        `${formatarDataBR(dataBaixa)} ${horaBaixa}`
      );
    }

    addLinha(colDatas, "Nº nota fiscal", f.NUMNOTA);
    addLinha(colDatas, "Nota única (Sankhya)", f.NUNOTA);
    addLinha(colDatas, "Nº fatura", f.NUFTC);
    addLinha(colDatas, "Nº renegociação", f.NURENEG);

    detalhes.appendChild(colResumo);
    detalhes.appendChild(colDatas);
  }

  const acoes = document.createElement("div");
  acoes.className = "item-dia-acoes";

  const btnEditar = document.createElement("button");
  btnEditar.className = "btn-mini btn-mini-pago";
  btnEditar.textContent = "Editar";
  btnEditar.onclick = () => abrirModalInclusao(d);

  const btnExcluir = document.createElement("button");
  btnExcluir.className = "btn-mini";
  btnExcluir.style.background = "#b91c1c";
  btnExcluir.style.color = "#fee2e2";
  btnExcluir.textContent = "Excluir";
  btnExcluir.onclick = () => abrirModalExclusao(d);

  acoes.appendChild(btnEditar);
  acoes.appendChild(btnExcluir);

  card.appendChild(header);
  card.appendChild(detalhes);
  card.appendChild(acoes);

  return card;
}

// ================== MODAL INCLUSÃO / EDIÇÃO ==================
function abrirModalInclusao(despesa) {
  const modal = document.getElementById("modalInclusao");
  if (!modal) return;

  document.getElementById("descricao").value = despesa?.descricao || "";
  document.getElementById("dataVenc").value = despesa?.vencimento || "";
  document.getElementById("empresaDespesa").value =
    despesa?.empresa || EMPRESA_ATUAL || 30;
  document.getElementById("recorrente").value =
    despesa?.recorrente === "mensal" ? "mensal" : "nao";

  window._contatosSelecionadosTemp = Array.isArray(despesa?.responsaveis)
    ? despesa.responsaveis.map(c => ({ ...c }))
    : [];
  renderizarChipsContatosSelecionados();

  modal.dataset.idEdicao = despesa ? despesa.id : "";
  modal.style.display = "flex";
}

function fecharModalInclusao() {
  const modal = document.getElementById("modalInclusao");
  if (!modal) return;
  modal.style.display = "none";
  modal.dataset.idEdicao = "";
  window._contatosSelecionadosTemp = [];
  renderizarChipsContatosSelecionados();
}

async function salvarDespesa(event) {
  if (event) event.preventDefault();

  const descricao = document.getElementById("descricao").value.trim();
  const dataVenc = document.getElementById("dataVenc").value;
  const empresaDespesa = document.getElementById("empresaDespesa").value;
  const recorrente = document.getElementById("recorrente").value;
  const modal = document.getElementById("modalInclusao");
  const idEdicao = modal ? modal.dataset.idEdicao : "";

  if (!descricao || !dataVenc || !empresaDespesa) {
    alert("Preencha descrição, vencimento e empresa.");
    return;
  }

  const tiposAviso = [];
  if (document.getElementById("aviso7").checked) tiposAviso.push("7");
  if (document.getElementById("aviso5").checked) tiposAviso.push("5");
  if (document.getElementById("aviso3").checked) tiposAviso.push("3");
  if (document.getElementById("aviso1").checked) tiposAviso.push("1");
  if (document.getElementById("aviso0").checked) tiposAviso.push("0");
  if (!tiposAviso.length) tiposAviso.push("3");

  const responsaveis = (window._contatosSelecionadosTemp || []).map(c => ({
    nome: c.nome,
    telefone: c.telefone,
    tipo: c.tipo || "responsavel"
  }));

  const payload = {
    empresa: empresaDespesa,
    descricao,
    data_vencimento: dataVenc,
    recorrencia_tipo: recorrente === "mensal" ? "mensal" : "nao",
    contato_principal: null,
    contatos: responsaveis,
    tipos_aviso: tiposAviso
  };

  showLoader();
  try {
    if (!idEdicao) {
      const resp = await apiPost("/despesas", payload);
      console.log("salvarDespesa (novo) resp:", resp);
    } else {
      const resp = await apiPut(`/despesas/${idEdicao}`, payload);
      console.log("salvarDespesa (edição) resp:", resp);
    }

    await initCalendario();
    fecharModalInclusao();
  } catch (e) {
    console.error("Erro em salvarDespesa:", e);
    alert("Erro ao salvar despesa na API.");
  } finally {
    hideLoader();
  }
}

// ================== MODAL EXCLUSÃO ==================
function abrirModalExclusao(despesa) {
  _idParaExcluir = despesa.id;
  _recorrenciaParaExcluir = despesa.recorrente || "nao";

  const modal = document.getElementById("modalConfirmarExclusao");
  if (!modal) return;

  document.getElementById("motivoExclusao").value = "";
  document.getElementById("erroMotivoExclusao").textContent = "";
  document.getElementById("erroSenhaExclusao").textContent = "";

  const blocoRec = document.getElementById("blocoRecorrencia");
  const blocoSenha = document.getElementById("blocoSenhaExclusao");

  if (blocoRec) {
    blocoRec.style.display =
      _recorrenciaParaExcluir === "mensal" ? "block" : "none";
  }

  const user = getUsuarioAtual();
  if (blocoSenha) {
    blocoSenha.style.display =
      user && user.tipo === "ADMIN" ? "block" : "none";
  }

  if (_recorrenciaParaExcluir === "mensal") {
    const radios = document.querySelectorAll(
      'input[name="modoExclusao"][value="unico"]'
    );
    radios.forEach(r => (r.checked = true));
  }

  modal.style.display = "flex";
}

function fecharModalExclusao() {
  const modal = document.getElementById("modalConfirmarExclusao");
  if (!modal) return;
  modal.style.display = "none";
  _idParaExcluir = null;
  _recorrenciaParaExcluir = null;
  document.getElementById("motivoExclusao").value = "";
  document.getElementById("erroMotivoExclusao").textContent = "";
  document.getElementById("erroSenhaExclusao").textContent = "";
}

async function confirmarExclusaoDespesa() {
  if (!_idParaExcluir) return;

  const motivo = document.getElementById("motivoExclusao").value.trim();
  const erroMotivo = document.getElementById("erroMotivoExclusao");
  const erroSenha = document.getElementById("erroSenhaExclusao");
  const blocoSenha = document.getElementById("blocoSenhaExclusao");
  const senhaInput = document.getElementById("senhaExclusao");

  if (erroMotivo) erroMotivo.textContent = "";
  if (erroSenha) erroSenha.textContent = "";

  if (!motivo) {
    if (erroMotivo)
      erroMotivo.textContent = "Informe o motivo da exclusão.";
    return;
  }

  const user = getUsuarioAtual();
  if (blocoSenha && blocoSenha.style.display === "block") {
    const senha = (senhaInput?.value || "").trim();
    if (!senha) {
      if (erroSenha)
        erroSenha.textContent = "Informe a senha de administrador.";
      return;
    }
    if (senha !== ADMIN_PASSWORD) {
      if (erroSenha) erroSenha.textContent = "Senha incorreta.";
      return;
    }
  }

  let modo = "unico";
  if (_recorrenciaParaExcluir === "mensal") {
    const selecionado = document.querySelector(
      'input[name="modoExclusao"]:checked'
    );
    if (selecionado) modo = selecionado.value;
  }

  const payload = {
    motivo,
    modo,
    empresa: EMPRESA_ATUAL,
    usuarioEmail: user ? user.email : null
  };

  showLoader();
  try {
    await apiDelete(`/despesas/${_idParaExcluir}`, payload);
    await initCalendario();
    fecharModalExclusao();
  } catch (e) {
    console.error("Erro em confirmarExclusaoDespesa:", e);
    alert("Erro ao excluir despesa na API.");
  } finally {
    hideLoader();
  }
}

// ================== MODAL SELEÇÃO ENVIO ==================
async function abrirModalSelecionarEnvio() {
  const modal = document.getElementById("modalSelecionarEnvio");
  const lista = document.getElementById("listaSelecionarEnvio");
  if (!modal || !lista) return;

  lista.innerHTML = "";

  const hojeISO = dataISO(new Date());
  const candidatas = (window._despesasFiltradas || []).filter(d => {
    if (d.status === "pago") return false;
    if (d.vencimento && d.vencimento < hojeISO) return true;
    if (d.vencimento && d.vencimento === hojeISO) return true;
    return false;
  });

  if (!candidatas.length) {
    const vazio = document.createElement("div");
    vazio.style.fontSize = "0.85rem";
    vazio.style.color = "#9ca3af";
    vazio.textContent = "Nenhuma despesa vencida ou vencendo hoje.";
    lista.appendChild(vazio);
  } else {
    candidatas.forEach(d => {
      const item = document.createElement("div");
      item.className = "item-dia";

      const header = document.createElement("div");
      header.className = "item-dia-header";

      const desc = document.createElement("div");
      desc.className = "item-dia-desc";
      desc.textContent = d.descricao || "Despesa";

      const info = document.createElement("div");
      info.className = "item-dia-info";
      info.textContent = `Vencimento: ${formatarDataBR(d.vencimento)}`;

      header.appendChild(desc);
      header.appendChild(info);

      const statusDiv = document.createElement("div");
      statusDiv.className = "item-dia-status " + classeStatus(d, hojeISO);
      statusDiv.textContent =
        d.vencimento < hojeISO
          ? "Vencida"
          : d.vencimento === hojeISO
          ? "Hoje"
          : "Pendente";

      const acoes = document.createElement("div");
      acoes.className = "item-dia-acoes";

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.className = "chk-envio";
      chk.dataset.id = d.id;

      acoes.appendChild(chk);

      item.appendChild(header);
      item.appendChild(statusDiv);
      item.appendChild(acoes);

      lista.appendChild(item);
    });
  }

  modal.style.display = "flex";
}

function fecharModalSelecionarEnvio() {
  const modal = document.getElementById("modalSelecionarEnvio");
  if (!modal) return;
  modal.style.display = "none";
}

async function confirmarEnvioSelecionado() {
  const lista = document.getElementById("listaSelecionarEnvio");
  if (!lista) return;

  const selecionados = Array.from(
    lista.querySelectorAll(".chk-envio")
  ).filter(chk => chk.checked);

  if (!selecionados.length) {
    alert("Selecione ao menos uma despesa para envio.");
    return;
  }

  const idsSelecionados = selecionados.map(chk => chk.dataset.id);

  const despesasEnviar = (window._despesasFiltradas || []).filter(d =>
    idsSelecionados.includes(String(d.id))
  );

  if (!despesasEnviar.length) {
    alert("Nenhuma despesa correspondente encontrada.");
    return;
  }

  showLoader();
  try {
    const payload = {
      empresa: EMPRESA_ATUAL,
      despesas: despesasEnviar.map(d => ({
        id: d.id,
        descricao: d.descricao,
        vencimento: d.vencimento,
        responsaveis: d.responsaveis || [],
        tiposAviso: d.tiposAviso || ["3"]
      }))
    };

    const url = `${window.WHATSAPP_BASE}/enviar-lembretes`;
    console.log("[confirmarEnvioSelecionado] POST", url, payload);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const resultado = await resp.json();
    console.log("[confirmarEnvioSelecionado] resp:", resultado);

    fecharModalSelecionarEnvio();
    abrirModalResultadoEnvio(resultado);
  } catch (e) {
    console.error("Erro em confirmarEnvioSelecionado:", e);
    alert("Erro ao enviar lembretes via WhatsApp.");
  } finally {
    hideLoader();
  }
}

// ================== MODAL RESULTADO ENVIO ==================
function abrirModalResultadoEnvio(resultado) {
  const modal = document.getElementById("modalResultadoEnvio");
  const lista = document.getElementById("resultadoEnvioLista");
  if (!modal || !lista) return;

  lista.innerHTML = "";

  if (!resultado || !Array.isArray(resultado.itens) || !resultado.itens.length) {
    const vazio = document.createElement("div");
    vazio.style.fontSize = "0.85rem";
    vazio.style.color = "#9ca3af";
    vazio.textContent = "Nenhum resultado informado pelo serviço.";
    lista.appendChild(vazio);
  } else {
    resultado.itens.forEach(item => {
      const linha = document.createElement("div");
      linha.className = "resultado-envio-item";

      const desc = document.createElement("div");
      desc.className = "resultado-envio-desc";
      desc.textContent = `${item.descricaoDespesa || "Despesa"} – ${
        item.telefoneDestino || "Sem telefone"
      }`;

      const status = document.createElement("div");
      status.className = "resultado-envio-status";
      status.textContent =
        item.sucesso === true ? "Enviado" : "Falha no envio";

      linha.appendChild(desc);
      linha.appendChild(status);

      lista.appendChild(linha);
    });
  }

  modal.style.display = "flex";
}

function fecharModalResultadoEnvio() {
  const modal = document.getElementById("modalResultadoEnvio");
  if (!modal) return;
  modal.style.display = "none";
}