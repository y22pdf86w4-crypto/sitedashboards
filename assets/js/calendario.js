// ================== CONFIGURAÇÕES GERAIS ==================
let EMPRESA_ATUAL = null;
let mesAtual = new Date();
let _idParaExcluir = null;
let _recorrenciaParaExcluir = null;
const ADMIN_PASSWORD = "admin123";

window.API_BASE =
  "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
window.WHATSAPP_BASE = "http://172.18.4.12:3000";

// ================== LOADER GLOBAL ==================
function showLoader() {
  const el = document.getElementById("loaderGlobal");
  if (el) el.style.display = "flex";
}

function hideLoader() {
  const el = document.getElementById("loaderGlobal");
  if (el) el.style.display = "none";
}

// ================== HELPERS API ==================
async function apiGet(path) {
  const user = typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  const url = `${window.API_BASE}${path}`;
  console.log("[API GET] URL:", url);
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-usuario-email": user ? user.email : "",
    },
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
  const user = typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  const url = `${window.API_BASE}${path}`;
  console.log("[API POST] URL:", url, "body:", body);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-usuario-email": user ? user.email : "",
    },
    body: JSON.stringify(body),
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
  const user = typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  const url = `${window.API_BASE}${path}`;
  console.log("[API PUT] URL:", url, "body:", body);
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-usuario-email": user ? user.email : "",
    },
    body: JSON.stringify(body),
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
  const user = typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  const url = `${window.API_BASE}${path}`;
  console.log("[API DELETE] URL:", url, "body:", body);
  const resp = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "x-usuario-email": user ? user.email : "",
    },
    body: body ? JSON.stringify(body) : null,
  });
  console.log("[API DELETE] status:", resp.status);
  if (!resp.ok) {
    const txt = await resp.text();
    console.error("[API DELETE] erro body:", txt);
    throw new Error(`DELETE ${path} status ${resp.status}`);
  }
}

// ================== LOCAL STORAGE KEYS ==================
function storageKey(base) {
  const emp = EMPRESA_ATUAL || "geral";
  return `${base}_${emp}`;
}
function getStorageKeys() {
  return {
    STORAGE_KEY: storageKey("calendario_pagamentos"),
    LOG_KEY: storageKey("calendario_pagamentos_logs"),
  };
}

// estado global
window._contatosSelecionadosTemp = [];
window._contatos = [];
window._despesas = [];
window._despesasFiltradas = [];

// filtros
let filtroBuscaTexto = "";
let filtroStatus = "todos";
let filtroDataInicio = "";
let filtroDataFim = "";
let _ultimoValorBusca = "";

// ================== PROTEÇÃO / LOG DO CAMPO DE BUSCA ==================
function habilitarBuscaTexto(input) {
  input.removeAttribute("readonly");
  if (input.value !== "") {
    console.log(
      "[BUSCA] limpando valor ao focar (provavelmente autofill):",
      input.value
    );
    input.value = "";
  }
  input.oninput = function (ev) {
    console.log(
      "[BUSCA oninput] value:",
      ev.target.value,
      "inputType:",
      ev.inputType
    );
    onChangeBuscaTexto(ev.target.value);
  };
}

// ================== INIT ==================
async function initPagina() {
  console.log("========== initPagina INÍCIO ==========");
  const user = getUsuarioAtual();
  console.log("[INIT] user:", user);
  if (!user) {
    window.location.href = "../index.html";
    return;
  }

  const emp = sessionStorage.getItem("empresaSelecionada");
  console.log(
    "[INIT] empresaSelecionada:",
    emp,
    "empresas usuário:",
    user.empresas
  );
  if (!emp || !user.empresas || !user.empresas.includes(emp)) {
    window.location.href = "./select-company.html";
    return;
  }

  EMPRESA_ATUAL = emp;
  console.log("[INIT] EMPRESA_ATUAL =", EMPRESA_ATUAL);

  // Ajusta cabeçalho conforme empresa
  const logo = document.getElementById("logoEmpresa");
  const logoMobile = document.getElementById("logoEmpresaMobile");
  const headerTitle = document.getElementById("headerTitle");
  const headerSub = document.getElementById("headerSub");
  const mobileTitle = document.getElementById("mobileTitle");
  const mobileSub = document.getElementById("mobileSub");

  if (EMPRESA_ATUAL === "linhagro") {
    if (logo) logo.src = "../assets/imagem/logolinhagro.png";
    if (logoMobile) logoMobile.src = "../assets/imagem/logolinhagro.png";
    if (headerTitle) headerTitle.textContent = "Calendário Linhagro";
    if (headerSub)
      headerSub.textContent =
        "Vencimentos e lembretes integrados ao financeiro Linhagro.";
    if (mobileTitle) mobileTitle.textContent = "Calendário Linhagro";
    if (mobileSub) mobileSub.textContent = "Empresa: Linhagro";
  } else {
    if (logo) logo.src = "../assets/imagem/logolitho.png";
    if (logoMobile) logoMobile.src = "../assets/imagem/logolitho.png";
    if (headerTitle) headerTitle.textContent = "Calendário Lithoplant";
    if (headerSub)
      headerSub.textContent =
        "Vencimentos e lembretes integrados ao financeiro Lithoplant.";
    if (mobileTitle) mobileTitle.textContent = "Calendário Lithoplant";
    if (mobileSub) mobileSub.textContent = "Empresa: Lithoplant";
  }

  // zera filtros em memória
  filtroBuscaTexto = "";
  filtroStatus = "todos";
  filtroDataInicio = "";
  filtroDataFim = "";
  _ultimoValorBusca = "";

  // trata campo de busca (bloqueia autofill)
  const inpBusca = document.getElementById("buscaTexto");
  if (inpBusca) {
    inpBusca.value = "";
    inpBusca.setAttribute("readonly", "readonly");
    setTimeout(() => {
      if (inpBusca.value !== "") {
        console.log("[INIT] browser preencheu buscaTexto:", inpBusca.value);
        inpBusca.value = "";
      }
    }, 800);
  }

  // reseta selects de filtro
  const selStatus = document.getElementById("filtroStatus");
  const dtIni = document.getElementById("filtroDataInicio");
  const dtFim = document.getElementById("filtroDataFim");
  if (selStatus) selStatus.value = "todos";
  if (dtIni) dtIni.value = "";
  if (dtFim) dtFim.value = "";

  // header do usuário
  preencherHeaderUsuario(user, "saudacao", "userName");

  // partículas de fundo
  gerarParticulasSelector(".particles-container", 18);

  // carrega calendário
  await initCalendario();
  console.log("========== initPagina FIM ==========");
}

// Troca de empresa: alterna explícito entre linhagro / lithoplant
function trocarEmpresa() {
  console.log("====== trocarEmpresa() CHAMADA ======");
  const user = typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  console.log("[TROCAR_EMPRESA] user atual:", user);

  if (!user || !Array.isArray(user.empresas) || user.empresas.length === 0) {
    alert("Nenhuma empresa disponível para este usuário.");
    console.warn("[TROCAR_EMPRESA] Usuário sem empresas.");
    return;
  }

  const atual = sessionStorage.getItem("empresaSelecionada");
  console.log("[TROCAR_EMPRESA] atual em sessionStorage =", atual);

  let novaEmpresa = "linhagro";
  if (atual === "linhagro") novaEmpresa = "lithoplant";
  else if (atual === "lithoplant") novaEmpresa = "linhagro";

  console.log("[TROCAR_EMPRESA] novaEmpresa =", novaEmpresa);
  sessionStorage.setItem("empresaSelecionada", novaEmpresa);
  console.log(
    "[TROCAR_EMPRESA] depois do set, sessionStorage.empresaSelecionada =",
    sessionStorage.getItem("empresaSelecionada")
  );

  window.location.href = "./calendario.html";
}

// ================== INIT CALENDÁRIO / CONTATOS ==================
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

      despesasManuais = (dados.despesas || []).map((d) => {
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
          motivoExclusao: null,
          excluidoPor: null,
          dataExclusao: null,
          origem: "manual",
          logDetalhado: null,
        };
      });
    } catch (e) {
      console.error(
        "Erro ao carregar despesas do backend, usando localStorage como fallback:",
        e
      );
      carregarDespesas();
      normalizarModeloDespesas();
      expandirRecorrencias();
      despesasManuais = window._despesas || [];
    }

    // FINANCEIRO SANKHYA
    try {
      console.log("[initCalendario] chamando /despesas-financeiro");
      const dadosFin = await apiGet(
        `/despesas-financeiro?empresa=${EMPRESA_ATUAL}`
      );
      console.log("[initCalendario] resposta /despesas-financeiro =", dadosFin);

      const todasFin = Array.isArray(dadosFin.despesas_financeiro)
        ? dadosFin.despesas_financeiro
        : [];

      const filtradas = todasFin.filter((d) => {
        const dtVenc = d.DTVENC ? d.DTVENC.slice(0, 10) : null;
        if (!dtVenc) return false;

        const anoV = dtVenc.substring(0, 4);
        const mesV = dtVenc.substring(5, 7);
        const mesComparar = `${anoV}-${mesV}`;
        if (mesComparar !== mesStr) return false;

        const cod = Number(String(d.CODEMP ?? "").trim());

        let pertence = false;
        if (EMPRESA_ATUAL === "linhagro") {
          pertence = Number.isFinite(cod) && cod >= 30 && cod <= 39;
        } else if (EMPRESA_ATUAL === "lithoplant") {
          pertence = cod === 80 || cod === 81;
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

      despesasFinanceiro = filtradas.map((d) => {
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
          motivoExclusao: null,
          excluidoPor: null,
          dataExclusao: null,
          origem: "sankhya",
          logDetalhado: {
            criadoEm: hojeISO2,
            baixadoEm: dtBaixa || null,
            origem: "Sankhya",
            financeiro: { ...d },
          },
        };
      });
    } catch (e) {
      console.error("Erro ao carregar /despesas-financeiro:", e);
      despesasFinanceiro = [];
    }

    window._despesas = [...despesasManuais, ...despesasFinanceiro];

    normalizarModeloDespesas();
    expandirRecorrencias();

    aplicarFiltros();
    renderizarCalendario();
  } catch (e) {
    console.error("Erro em initCalendario:", e);
  } finally {
    hideLoader();
  }
}

// ================== PERSISTÊNCIA LOCAL ==================
function carregarDespesas() {
  const { STORAGE_KEY } = getStorageKeys();
  const data = localStorage.getItem(STORAGE_KEY);
  window._despesas = data ? JSON.parse(data) : [];
}
function salvarDespesas() {
  const { STORAGE_KEY } = getStorageKeys();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(window._despesas || []));
}

// ================== CONTATOS ==================
async function carregarContatos() {
  const user = typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  const empresa = EMPRESA_ATUAL;

  try {
    const url = `${window.API_BASE}/contatos?empresa=${encodeURIComponent(
      empresa
    )}`;
    console.log("[carregarContatos] GET", url);
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-usuario-email": user ? user.email : "",
      },
    });
    console.log("[carregarContatos] status:", resp.status);
    if (!resp.ok) {
      console.error(
        "Erro ao buscar contatos da API:",
        resp.status,
        await resp.text()
      );
      window._contatos = [];
    } else {
      const data = await resp.json();
      console.log("[carregarContatos] json:", data);
      window._contatos = Array.isArray(data.contatos) ? data.contatos : [];
    }
  } catch (e) {
    console.error("Falha ao chamar /contatos:", e);
    window._contatos = [];
  }

  preencherSelectContatos();
}

async function abrirGerenciadorContatos() {
  showLoader();
  try {
    await carregarContatos();
    renderizarListaContatos();
  } finally {
    hideLoader();
  }

  const modal = document.getElementById("modalContato");
  if (!modal) return;

  document.getElementById("contatoIndexEdicao").value = "";
  document.getElementById("contatoNome").value = "";
  document.getElementById("contatoTelefone").value = "";

  modal.style.display = "flex";
}

function fecharModalContato() {
  const modal = document.getElementById("modalContato");
  if (!modal) return;
  modal.style.display = "none";
}

function renderizarListaContatos() {
  const lista = document.getElementById("listaContatos");
  if (!lista) return;
  lista.innerHTML = "";
  const contatos = window._contatos || [];

  if (!contatos.length) {
    const vazio = document.createElement("div");
    vazio.style.fontSize = "0.8rem";
    vazio.style.color = "#9ca3af";
    vazio.textContent = "Nenhum contato cadastrado ainda.";
    lista.appendChild(vazio);
    return;
  }

  contatos.forEach((c, idx) => {
    const item = document.createElement("div");
    item.className = "item-dia";

    const header = document.createElement("div");
    header.className = "item-dia-header";

    const desc = document.createElement("div");
    desc.className = "item-dia-desc";
    desc.textContent = c.nome;

    const telefone = document.createElement("div");
    telefone.className = "item-dia-email";
    telefone.textContent = c.telefone;

    header.appendChild(desc);
    header.appendChild(telefone);

    const acoes = document.createElement("div");
    acoes.className = "item-dia-acoes";

    const btnEditar = document.createElement("button");
    btnEditar.className = "btn-mini btn-mini-pago";
    btnEditar.textContent = "Editar";
    btnEditar.onclick = () => editarContato(idx);

    const btnExcluir = document.createElement("button");
    btnExcluir.className = "btn-mini";
    btnExcluir.style.background = "#b91c1c";
    btnExcluir.style.color = "#fee2e2";
    btnExcluir.textContent = "Excluir";
    btnExcluir.onclick = () => excluirContato(idx);

    acoes.appendChild(btnEditar);
    acoes.appendChild(btnExcluir);

    item.appendChild(header);
    item.appendChild(acoes);

    lista.appendChild(item);
  });
}

function editarContato(index) {
  const contatos = window._contatos || [];
  const c = contatos[index];
  if (!c) return;

  document.getElementById("contatoIndexEdicao").value = String(index);
  document.getElementById("contatoNome").value = c.nome || "";
  document.getElementById("contatoTelefone").value = c.telefone || "";
}

async function excluirContato(index) {
  const contatos = window._contatos || [];
  const c = contatos[index];
  if (!c) return;

  if (!confirm("Deseja realmente excluir este contato?")) return;

  const user = getUsuarioAtual();
  showLoader();
  try {
    await apiDelete(`/contatos/${c.id}`, {
      usuarioEmail: user ? user.email : null,
    });

    await carregarContatos();
    renderizarListaContatos();
  } catch (e) {
    console.error("Erro em excluirContato:", e);
    alert("Erro ao excluir contato na API.");
  } finally {
    hideLoader();
  }
}

async function salvarContato(event) {
  event.preventDefault();

  const nome = document.getElementById("contatoNome").value.trim();
  const telefone = document.getElementById("contatoTelefone").value.trim();
  const idxStr = document.getElementById("contatoIndexEdicao").value;
  const user = getUsuarioAtual();
  const empresa = EMPRESA_ATUAL;

  if (!nome || !telefone) return;

  const payload = {
    empresa,
    nome,
    telefone,
    usuarioEmail: user ? user.email : null,
  };

  showLoader();
  try {
    if (idxStr === "") {
      await apiPost("/contatos", payload);
    } else {
      const idx = Number(idxStr);
      const contatoAtual = (window._contatos || [])[idx];
      if (!contatoAtual) return;

      await apiPut(`/contatos/${contatoAtual.id}`, {
        nome,
        telefone,
        usuarioEmail: user ? user.email : null,
      });
    }

    await carregarContatos();
    renderizarListaContatos();

    document.getElementById("contatoIndexEdicao").value = "";
    document.getElementById("contatoNome").value = "";
    document.getElementById("contatoTelefone").value = "";
  } catch (e) {
    console.error("Erro em salvarContato:", e);
    alert("Erro ao salvar contato na API.");
  } finally {
    hideLoader();
  }
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
    (c) => c.telefone === contato.telefone
  );
  if (!jaExiste) {
    window._contatosSelecionadosTemp.push({
      nome: contato.nome,
      telefone: contato.telefone,
      tipo: "responsavel",
    });
    renderizarChipsContatosSelecionados();
  }

  sel.value = "";
}

function adicionarContatoRapido() {
  const extraNome = document.getElementById("extraNome").value.trim();
  const extraTelefone = document.getElementById("extraTelefone").value.trim();
  if (!extraTelefone) {
    alert("Informe o telefone do contato rápido.");
    return;
  }

  const jaExiste = window._contatosSelecionadosTemp.some(
    (c) => c.telefone === extraTelefone
  );
  if (!jaExiste) {
    window._contatosSelecionadosTemp.push({
      nome: extraNome || "Contato",
      telefone: extraTelefone,
      tipo: "responsavel",
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

// ================== NORMALIZAÇÃO / LOG / RECORRÊNCIA ==================
function normalizarModeloDespesas() {
  if (!Array.isArray(window._despesas)) return;

  window._despesas = window._despesas.map((d) => {
    const novo = { ...d };

    if (!Array.isArray(novo.responsaveis)) {
      const arr = [];
      if (novo.responsavel && novo.responsavel.telefone)
        arr.push(novo.responsavel);
      if (novo.alertar && novo.alertar.telefone) arr.push(novo.alertar);
      if (!arr.length && novo.telefone) {
        arr.push({
          nome: novo.responsavelNome || "Responsável",
          telefone: novo.telefone,
          tipo: "responsavel",
        });
      }
      novo.responsaveis = arr;
    } else {
      novo.responsaveis = novo.responsaveis.map((r) => ({
        ...r,
        tipo: r.tipo || "responsavel",
      }));
    }

    if (!novo.tiposAviso) {
      if (typeof novo.diasAntes === "number") {
        novo.tiposAviso = [String(novo.diasAntes)];
      } else {
        novo.tiposAviso = ["3"];
      }
    } else if (typeof novo.tiposAviso === "string") {
      novo.tiposAviso = novo.tiposAviso
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }

    delete novo.responsavel;
    delete novo.alertar;
    return novo;
  });

  salvarDespesas();
}

function registrarLog(acao, despesa, detalhes) {
  const { LOG_KEY } = getStorageKeys();
  const raw = localStorage.getItem(LOG_KEY);
  const logs = raw ? JSON.parse(raw) : [];
  const user = typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  const usuario = user && (user.nome || user.email || "Desconhecido");

  const entry = {
    id: Date.now(),
    acao,
    despesaId: despesa.id,
    descricao: despesa.descricao,
    dataVenc: despesa.vencimento,
    empresa: despesa.empresa || EMPRESA_ATUAL,
    usuario,
    dataAcao: new Date().toISOString(),
    detalhes: detalhes || null,
  };
  console.log("[LOG] registrando:", entry);

  logs.push(entry);

  localStorage.setItem(LOG_KEY, JSON.stringify(logs));
}

function expandirRecorrencias() {
  const hoje = new Date();
  const anoLimite = hoje.getFullYear();
  const limite = new Date(anoLimite, 11, 31);

  const existentes = window._despesas || [];
  const novas = [];

  existentes
    .filter((d) => d.recorrente === "mensal" && !d.excluido)
    .forEach((d) => {
      if (!d.vencimento) return;
      const [ano, mes, dia] = d.vencimento.split("-").map(Number);
      let base = new Date(ano, mes - 1, dia);
      if (base > limite) return;

      base = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());

      while (base <= limite) {
        const dataStr = base.toISOString().slice(0, 10);

        const jaExiste = existentes.some(
          (x) =>
            x.vencimento === dataStr &&
            x.descricao === d.descricao &&
            !x.excluido &&
            x.empresa === (d.empresa || EMPRESA_ATUAL)
        );
        const jaNoNovo = novas.some(
          (x) => x.vencimento === dataStr && x.descricao === d.descricao
        );

        if (!jaExiste && !jaNoNovo) {
          novas.push({
            ...d,
            id: Date.now() + Math.random(),
            vencimento: dataStr,
            status: "pendente",
            dataPagamento: null,
          });
        }

        base.setMonth(base.getMonth() + 1);
      }
    });

  if (novas.length > 0) {
    console.log("DEBUG expandirRecorrencias novas geradas =", novas.length);
    window._despesas = existentes.concat(novas);
    salvarDespesas();
  }
}

// ================== UTILS / FILTROS ==================
function mudarMes(delta) {
  mesAtual.setMonth(mesAtual.getMonth() + delta);
  console.log("[mudarMes] novo mesAtual:", mesAtual);

  filtroBuscaTexto = "";
  _ultimoValorBusca = "";
  const inpBusca = document.getElementById("buscaTexto");
  if (inpBusca) inpBusca.value = "";

  initCalendario();
}

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
    "Dezembro",
  ];
  return meses[date.getMonth()] + " de " + date.getFullYear();
}
function dataISO(d) {
  return d.toISOString().slice(0, 10);
}

function formatarDataBR(isoCompleta) {
  if (!isoCompleta) return "";
  const soData = isoCompleta.substring(0, 10);
  return soData.split("-").reverse().join("/");
}

function aplicarFiltros() {
  if (!Array.isArray(window._despesas)) {
    window._despesasFiltradas = [];
    return;
  }
  const hojeISO = dataISO(new Date());

  window._despesasFiltradas = window._despesas.filter((d) => {
    if (d.empresa !== EMPRESA_ATUAL) return false;
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

  if (inpBusca) {
    inpBusca.value = "";
    inpBusca.setAttribute("readonly", "readonly");
  }
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

function abrirModalFiltros() {
  const modal = document.getElementById("modalFiltros");
  if (!modal) return;

  const selStatus = document.getElementById("filtroStatus");
  const dtIni = document.getElementById("filtroDataInicio");
  const dtFim = document.getElementById("filtroDataFim");

  if (selStatus) selStatus.value = filtroStatus || "todos";
  if (dtIni) dtIni.value = filtroDataInicio || "";
  if (dtFim) dtFim.value = filtroDataFim || "";

  modal.style.display = "flex";
}

function fecharModalFiltros() {
  const modal = document.getElementById("modalFiltros");
  if (!modal) return;
  modal.style.display = "none";
}

// ================== CALENDÁRIO / MODAL DIA ==================
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
  const despesasEmpresa = window._despesasFiltradas || [];

  console.log(
    "[renderizarCalendario] total _despesasFiltradas:",
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

    let despesasDoDia = despesasEmpresa.filter(
      (d) => d.vencimento === dataStr
    );
    despesasDoDia = ordenarDespesas(despesasDoDia, hojeISO);

    const maxMostrar = 4;
    const qtd = despesasDoDia.length;
    const mostrar = despesasDoDia.slice(0, maxMostrar);

    mostrar.forEach((despesa) => {
      const pill = document.createElement("div");
      pill.className = "event-pill " + classeStatus(despesa, hojeISO);
      pill.textContent = despesa.descricao;

      // Tooltip custom
      pill.addEventListener("mouseenter", (e) => {
        showCalTooltip(despesa, e.clientX, e.clientY);
      });
      pill.addEventListener("mousemove", (e) => {
        showCalTooltip(despesa, e.clientX, e.clientY);
      });
      pill.addEventListener("mouseleave", () => {
        hideCalTooltip();
      });

      // Clique abre o modal detalhado
      pill.onclick = (e) => {
        e.stopPropagation();
        abrirModalDia(dataStr, despesa.id);
      };

      eventosDiv.appendChild(pill);
    });

    if (qtd > maxMostrar) {
      const restante = qtd - maxMostrar;
      const mais = document.createElement("div");
      mais.className = "event-pill status-pendente";
      mais.textContent = `+${restante} despesas`;
      mais.onclick = (e) => {
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
  if (despesa.vencimento < hojeISO) return "status-vencida alert-blink";
  if (despesa.vencimento === hojeISO) return "status-hoje";
  return "status-pendente";
}

// TOOLTIP COMPLETO (texto simples, ainda usado em outras partes se quiser)
function tooltipDespesa(d) {
  if (!d.vencimento) return d.descricao || "";

  const dtVenc = d.vencimento.split("-").reverse().join("/");
  const linhas = [];

  linhas.push(`${d.descricao || "Despesa"} – vencimento ${dtVenc}`);

  if (d.status === "pago" && d.dataPagamento) {
    linhas.push(
      `Situação: Pago em ${d.dataPagamento.split("-").reverse().join("/")}`
    );
  } else {
    linhas.push(`Situação: ${d.status === "pago" ? "Pago" : "Pendente"}`);
  }

  if (d.origem === "sankhya" && d.logDetalhado && d.logDetalhado.financeiro) {
    const f = d.logDetalhado.financeiro;

    if (f.NUFIN) linhas.push(`Número da despesa (financeiro): ${f.NUFIN}`);
    if (f.NOME_NATUREZA) linhas.push(`Natureza: ${f.NOME_NATUREZA}`);
    if (f.HISTORICO) linhas.push(`Descrição da despesa: ${f.HISTORICO}`);

    if (f.NOMEPARC || f.CODPARC) {
      const base = f.NOMEPARC || "Parceiro";
      linhas.push(
        `Fornecedor / Cliente: ${base}${
          f.CODPARC ? " (cód. " + f.CODPARC + ")" : ""
        }`
      );
    }

    if (f.VLRDESDOB != null) {
      linhas.push(
        `Valor: R$ ${Number(f.VLRDESDOB).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      );
    }

    if (f.CODNAT) linhas.push(`Cód. natureza financeira: ${f.CODNAT}`);
    if (f.CODCENCUS) linhas.push(`Centro de custo: ${f.CODCENCUS}`);
    if (f.CODCTABCOINT)
      linhas.push(`Conta bancária/contábil: ${f.CODCTABCOINT}`);
    if (f.CODTIPTIT) linhas.push(`Tipo de título: ${f.CODTIPTIT}`);
    if (f.CODTIPOPER) linhas.push(`Tipo de operação: ${f.CODTIPOPER}`);
    if (f.NUFTC) linhas.push(`Número da fatura: ${f.NUFTC}`);
    if (f.NURENEG) linhas.push(`Número da renegociação: ${f.NURENEG}`);
    if (f.NUMNOTA) linhas.push(`Número da nota fiscal: ${f.NUMNOTA}`);
    if (f.NUNOTA) linhas.push(`Nota única (Sankhya): ${f.NUNOTA}`);

    if (f.DTENTSAI) {
      linhas.push(`Data de entrada/saída: ${formatarDataBR(f.DTENTSAI)}`);
    }

    if (f.DTVENC) {
      linhas.push(`Vencimento no financeiro: ${formatarDataBR(f.DTVENC)}`);
    }

    if (f.DHBAIXA) {
      linhas.push(
        `Baixa no financeiro: ${f.DHBAIXA.substring(0, 10)
          .split("-")
          .reverse()
          .join("/")} ${f.DHBAIXA.substring(11, 19)}`
      );
    }
    if (f.DtCarga) {
      linhas.push(
        `Data de carga no dashboard: ${f.DtCarga.substring(0, 10)
          .split("-")
          .reverse()
          .join("/")} ${f.DtCarga.substring(11, 19)}`
      );
    }
  }

  return linhas.join("\n");
}

// TOOLTIP CUSTOM EM CARD (HTML)
function getTooltipHtml(d) {
  if (!d.vencimento)
    return (d.descricao || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const dtVenc = d.vencimento.split("-").reverse().join("/");
  const partes = [];

  // título + vencimento
  partes.push(
    `<div class="cal-tooltip-title">${(d.descricao || "Despesa")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")} – vencimento ${dtVenc}</div>`
  );

  // situação
  if (d.status === "pago" && d.dataPagamento) {
    const dtPag = d.dataPagamento.split("-").reverse().join("/");
    partes.push(
      `<div class="cal-tooltip-status">Situação: Pago em ${dtPag}</div>`
    );
  } else {
    const sit = d.status === "pago" ? "Pago" : "Pendente";
    partes.push(
      `<div class="cal-tooltip-status">Situação: ${sit}</div>`
    );
  }

  // detalhes financeiros (Sankhya)
  if (d.origem === "sankhya" && d.logDetalhado && d.logDetalhado.financeiro) {
    const f = d.logDetalhado.financeiro;
    const linhas = [];

    if (f.NUFIN) linhas.push(`Nº despesa: ${f.NUFIN}`);
    if (f.NOME_NATUREZA) linhas.push(`Natureza: ${f.NOME_NATUREZA}`);
    if (f.HISTORICO) linhas.push(`Descrição: ${f.HISTORICO}`);

    if (f.NOMEPARC || f.CODPARC) {
      const base = f.NOMEPARC || "Parceiro";
      linhas.push(
        `Fornecedor/Cliente: ${base}${
          f.CODPARC ? " (cód. " + f.CODPARC + ")" : ""
        }`
      );
    }

    if (f.VLRDESDOB != null) {
      linhas.push(
        `Valor: R$ ${Number(f.VLRDESDOB).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      );
    }

    if (f.CODNAT) linhas.push(`Natureza fin.: ${f.CODNAT}`);
    if (f.CODCENCUS) linhas.push(`Centro de custo: ${f.CODCENCUS}`);
    if (f.CODCTABCOINT) linhas.push(`Conta: ${f.CODCTABCOINT}`);
    if (f.CODTIPTIT) linhas.push(`Tipo título: ${f.CODTIPTIT}`);
    if (f.CODTIPOPER) linhas.push(`Tipo operação: ${f.CODTIPOPER}`);

    if (f.DTENTSAI) {
      linhas.push(`Entrada/Saída: ${formatarDataBR(f.DTENTSAI)}`);
    }
    if (f.DTVENC) {
      linhas.push(`Vencimento (financeiro): ${formatarDataBR(f.DTVENC)}`);
    }
    if (f.DHBAIXA) {
      const dt = f.DHBAIXA.substring(0, 10).split("-").reverse().join("/");
      const hr = f.DHBAIXA.substring(11, 19);
      linhas.push(`Baixa no financeiro: ${dt} ${hr}`);
    } else {
      linhas.push(
        "Status de pagamento controlado pelo financeiro (Sankhya)"
      );
    }

    partes.push(
      `<div class="cal-tooltip-body">${linhas
        .map((x) =>
          x.replace(/</g, "&lt;").replace(/>/g, "&gt;")
        )
        .join("<br>")}</div>`
    );
  }

  return partes.join("");
}

function showCalTooltip(despesa, clientX, clientY) {
  const el = document.getElementById("calTooltip");
  if (!el) return;

  el.innerHTML = getTooltipHtml(despesa);
  el.style.display = "block";

  const padding = 8;
  const rect = el.getBoundingClientRect();
  let left = clientX + 12;
  let top = clientY + 12;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (left + rect.width + padding > vw) {
    left = clientX - rect.width - 12;
  }
  if (top + rect.height + padding > vh) {
    top = clientY - rect.height - 12;
  }

  el.style.left = left + "px";
  el.style.top = top + "px";
}

function hideCalTooltip() {
  const el = document.getElementById("calTooltip");
  if (!el) return;
  el.style.display = "none";
}

// ================== MODAL DIA ==================
function abrirModalDia(dataISOdia, idFocar) {
  let despesasDoDia = (window._despesasFiltradas || []).filter(
    (d) => d.vencimento === dataISOdia
  );

  const hojeISO = dataISO(new Date());
  despesasDoDia = ordenarDespesas(despesasDoDia, hojeISO);

  console.log(
    "[abrirModalDia] data:",
    dataISOdia,
    "qtd:",
    despesasDoDia.length,
    "empresa:",
    EMPRESA_ATUAL
  );

  const modal = document.getElementById("modalDia");
  const container = document.getElementById("listaDiaContainer");
  const titulo = document.getElementById("tituloModalDia");

  titulo.textContent =
    "Despesas de " + dataISOdia.split("-").reverse().join("/");

  container.innerHTML = "";

  if (despesasDoDia.length === 0) {
    const vazio = document.createElement("div");
    vazio.style.fontSize = "0.85rem";
    vazio.style.color = "#9ca3af";
    vazio.textContent = "Nenhuma despesa cadastrada para este dia.";
    container.appendChild(vazio);
  } else {
    despesasDoDia.forEach((d) => {
      const item = document.createElement("div");
      item.className = "item-dia";
      item.dataset.idDespesa = d.id;

      const header = document.createElement("div");
      header.className = "item-dia-header";

      const desc = document.createElement("div");
      desc.className = "item-dia-desc";
      desc.textContent = d.descricao;

      const badge = document.createElement("span");
      badge.className = "event-pill " + classeStatus(d, hojeISO);
      badge.textContent =
        d.status === "pago"
          ? "Pago"
          : d.vencimento < hojeISO
          ? "Vencido"
          : d.vencimento === hojeISO
          ? "Hoje"
          : "Pendente";

      header.appendChild(desc);
      header.appendChild(badge);

      const linhaResp = document.createElement("div");
      linhaResp.className = "item-dia-email";

      let textoResp = "";

      if (
        d.origem === "sankhya" &&
        d.logDetalhado &&
        d.logDetalhado.financeiro
      ) {
        const f = d.logDetalhado.financeiro;
        const partes = [];

        if (f.NUFIN) partes.push(`Nº da despesa: ${f.NUFIN}`);
        if (f.NOME_NATUREZA) partes.push(`Natureza: ${f.NOME_NATUREZA}`);
        if (f.HISTORICO) partes.push(`Descrição: ${f.HISTORICO}`);

        if (f.NOMEPARC || f.CODPARC) {
          const base = f.NOMEPARC || "Parceiro";
          partes.push(
            `Fornecedor / Cliente: ${base}${
              f.CODPARC ? " (cód. " + f.CODPARC + ")" : ""
            }`
          );
        }

        if (f.VLRDESDOB != null) {
          partes.push(
            `Valor: R$ ${Number(f.VLRDESDOB).toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`
          );
        }

        if (f.CODNAT) partes.push(`Cód. natureza financeira: ${f.CODNAT}`);
        if (f.CODCENCUS) partes.push(`Centro de custo: ${f.CODCENCUS}`);
        if (f.CODCTABCOINT)
          partes.push(`Conta bancária/contábil: ${f.CODCTABCOINT}`);
        if (f.CODTIPTIT) partes.push(`Tipo de título: ${f.CODTIPTIT}`);
        if (f.CODTIPOPER) partes.push(`Tipo de operação: ${f.CODTIPOPER}`);
        if (f.NUFTC) partes.push(`Número da fatura: ${f.NUFTC}`);
        if (f.NURENEG) partes.push(`Renegociação: ${f.NURENEG}`);
        if (f.NUMNOTA) partes.push(`Nota fiscal: ${f.NUMNOTA}`);
        if (f.NUNOTA) partes.push(`Nota única (Sankhya): ${f.NUNOTA}`);

        textoResp = partes.join(" • ");
      } else {
        if (Array.isArray(d.responsaveis) && d.responsaveis.length) {
          textoResp =
            "Contatos: " +
            d.responsaveis
              .map((r) => {
                const tipoLabel =
                  r.tipo === "informativo" ? "informado" : "responsável";
                return `${r.nome} (${r.telefone} – ${tipoLabel})`;
              })
              .join(" • ");
        }

        if (d.recorrente === "mensal") {
          if (textoResp) textoResp += " • ";
          textoResp += "Recorrência: mensal";
        }
      }

      linhaResp.textContent = textoResp;

      const log = document.createElement("div");
      log.className = "item-dia-log";

      const partesLog = [];
      partesLog.push(
        "Situação: " + (d.status === "pago" ? "Pago" : "Pendente")
      );

      if (d.dataPagamento) {
        partesLog.push(
          "Pago em " + d.dataPagamento.split("-").reverse().join("/")
        );
      }

      if (
        d.origem === "sankhya" &&
        d.logDetalhado &&
        d.logDetalhado.financeiro
      ) {
        const f = d.logDetalhado.financeiro;

        if (f.DTENTSAI) {
          partesLog.push("Entrada/Saída: " + formatarDataBR(f.DTENTSAI));
        }
        if (f.DTVENC) {
          partesLog.push(
            "Vencimento (financeiro): " + formatarDataBR(f.DTVENC)
          );
        }
        if (f.DHBAIXA) {
          partesLog.push(
            "Baixa no financeiro: " +
              f.DHBAIXA.substring(0, 10).split("-").reverse().join("/") +
              " " +
              f.DHBAIXA.substring(11, 19)
          );
        } else {
          partesLog.push(
            "Status de pagamento controlado pelo financeiro (Sankhya)"
          );
        }
      }

      log.textContent = partesLog.join(" • ");

      const acoes = document.createElement("div");
      acoes.className = "item-dia-acoes";

      if (d.origem === "manual") {
        const btnPago = document.createElement("button");
        btnPago.className = "btn-mini btn-mini-pago";
        btnPago.textContent = "Marcar como pago";
        btnPago.onclick = () => alterarStatus(d.id, "pago");

        const btnPendente = document.createElement("button");
        btnPendente.className = "btn-mini btn-mini-pendente";
        btnPendente.textContent = "Voltar para pendente";
        btnPendente.onclick = () => alterarStatus(d.id, "pendente");

        const btnEditar = document.createElement("button");
        btnEditar.className = "btn-mini";
        btnEditar.style.background = "#0ea5e9";
        btnEditar.style.color = "#022c22";
        btnEditar.textContent = "Editar";
        btnEditar.onclick = () => editarDespesa(d.id);

        const btnExcluir = document.createElement("button");
        btnExcluir.className = "btn-mini";
        btnExcluir.style.background = "#b91c1c";
        btnExcluir.style.color = "#fee2e2";
        btnExcluir.textContent = "Excluir";
        btnExcluir.onclick = () => excluirDespesa(d.id);

        acoes.appendChild(btnPago);
        acoes.appendChild(btnPendente);
        acoes.appendChild(btnEditar);
        acoes.appendChild(btnExcluir);
      } else {
        const info = document.createElement("div");
        info.style.fontSize = "0.75rem";
        info.style.color = "#9ca3af";
        info.textContent =
          "Status de pagamento controlado apenas pelo financeiro (Sankhya).";
        acoes.appendChild(info);
      }

      item.appendChild(header);
      item.appendChild(linhaResp);
      if (log.textContent) item.appendChild(log);
      item.appendChild(acoes);

      container.appendChild(item);
    });

    if (idFocar != null) {
      const alvo = container.querySelector(
        `[data-id-despesa="${idFocar}"]`
      );
      if (alvo) {
        alvo.style.outline = "1px solid #38bdf8";
        alvo.style.boxShadow = "0 0 0 1px rgba(56,189,248,0.6)";
        alvo.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  modal.style.display = "flex";
}

function fecharModalDia() {
  const m = document.getElementById("modalDia");
  if (m) m.style.display = "none";
}

// ================== MODAL INCLUSÃO / EDIÇÃO ==================
function abrirModalInclusao(dataPre) {
  const modal = document.getElementById("modalInclusao");
  if (!modal) return;

  modal.style.display = "flex";

  const form = modal.querySelector("form");
  delete form.dataset.editId;

  document.getElementById("descricao").value = "";

  let valorData = dataPre;
  if (!valorData) {
    const hoje = new Date();
    valorData = hoje.toISOString().slice(0, 10);
  }
  document.getElementById("dataVenc").value = valorData;

  const selEmp = document.getElementById("empresaDespesa");
  if (selEmp && EMPRESA_ATUAL) {
    selEmp.value = EMPRESA_ATUAL;
  }

  document.getElementById("extraNome").value = "";
  document.getElementById("extraTelefone").value = "";

  document.getElementById("aviso7").checked = false;
  document.getElementById("aviso5").checked = false;
  document.getElementById("aviso3").checked = true;
  document.getElementById("aviso1").checked = false;
  document.getElementById("aviso0").checked = false;

  document.getElementById("recorrente").value = "nao";

  window._contatosSelecionadosTemp = [];
  preencherSelectContatos();
  renderizarChipsContatosSelecionados();

  document.getElementById("descricao").focus();
}

function fecharModalInclusao() {
  const modal = document.getElementById("modalInclusao");
  if (!modal) return;
  modal.style.display = "none";
}

function salvarDespesa(event) {
  event.preventDefault();

  const descricao = document.getElementById("descricao").value.trim();
  const dataVenc = document.getElementById("dataVenc").value;
  const empresaDespesa = document.getElementById("empresaDespesa").value;
  const recorrente = document.getElementById("recorrente").value;

  if (!descricao || !dataVenc) {
    alert("Informe descrição e data de vencimento.");
    return;
  }

  const tiposAviso = [];
  if (document.getElementById("aviso7").checked) tiposAviso.push("7");
  if (document.getElementById("aviso5").checked) tiposAviso.push("5");
  if (document.getElementById("aviso3").checked) tiposAviso.push("3");
  if (document.getElementById("aviso1").checked) tiposAviso.push("1");
  if (document.getElementById("aviso0").checked) tiposAviso.push("0");
  if (!tiposAviso.length) tiposAviso.push("3");

  const extraNome = document.getElementById("extraNome").value.trim();
  const extraTelefone =
    document.getElementById("extraTelefone").value.trim();

  const responsaveis = [...(window._contatosSelecionadosTemp || [])];

  if (extraTelefone) {
    const jaExiste = responsaveis.some(
      (r) => r.telefone === extraTelefone
    );
    if (!jaExiste) {
      responsaveis.push({
        nome: extraNome || "Contato",
        telefone: extraTelefone,
        tipo: "responsavel",
      });
    }
  }

  const modal = document.getElementById("modalInclusao");
  const form = modal.querySelector("form");
  const editId = form.dataset.editId;

  if (editId) {
    const idx = window._despesas.findIndex(
      (d) => d.id === Number(editId)
    );
    if (idx >= 0) {
      const antigo = window._despesas[idx];
      const atualizado = {
        ...antigo,
        descricao,
        vencimento: dataVenc,
        recorrente,
        tiposAviso,
        responsaveis,
        empresa: empresaDespesa,
      };
      window._despesas[idx] = atualizado;
      salvarDespesas();
      registrarLog("editar", atualizado, {
        antes: antigo,
        depois: atualizado,
      });
    }
  } else {
    const nova = {
      id: Date.now(),
      empresa: empresaDespesa,
      descricao,
      vencimento: dataVenc,
      status: "pendente",
      recorrente,
      responsaveis,
      tiposAviso,
      dataPagamento: null,
      excluido: false,
      motivoExclusao: null,
      excluidoPor: null,
      dataExclusao: null,
      origem: "manual",
      logDetalhado: null,
    };
    window._despesas.push(nova);
    salvarDespesas();
    registrarLog("criar", nova, null);
  }

  showLoader();
  try {
    aplicarFiltros();
    renderizarCalendario();
  } finally {
    hideLoader();
  }

  fecharModalInclusao();
}

// ================== EXCLUSÃO / STATUS ==================
function excluirDespesa(id) {
  const desp = window._despesas.find((d) => d.id === id);
  if (!desp) return;

  _idParaExcluir = id;
  _recorrenciaParaExcluir = desp.recorrente === "mensal";

  const modal = document.getElementById("modalConfirmarExclusao");
  if (!modal) return;

  document.getElementById("motivoExclusao").value = "";
  document.getElementById("erroMotivoExclusao").textContent = "";
  document.getElementById("erroSenhaExclusao").textContent = "";
  document.getElementById("senhaExclusao").value = "";

  const blocoRec = document.getElementById("blocoRecorrencia");
  if (blocoRec)
    blocoRec.style.display =
      desp.recorrente === "mensal" ? "block" : "none";

  const blocoSenha = document.getElementById("blocoSenhaExclusao");
  if (blocoSenha)
    blocoSenha.style.display = desp.status === "pago" ? "block" : "none";

  modal.style.display = "flex";
}

function fecharModalExclusao() {
  const modal = document.getElementById("modalConfirmarExclusao");
  if (!modal) return;
  modal.style.display = "none";
  _idParaExcluir = null;
  _recorrenciaParaExcluir = null;
}

function confirmarExclusaoDespesa() {
  if (_idParaExcluir == null) return;

  const motivo = document.getElementById("motivoExclusao").value.trim();
  const erroMotivo = document.getElementById("erroMotivoExclusao");
  const erroSenha = document.getElementById("erroSenhaExclusao");
  const senha = document.getElementById("senhaExclusao").value;

  erroMotivo.textContent = "";
  erroSenha.textContent = "";

  if (!motivo) {
    erroMotivo.textContent = "Informe o motivo da exclusão.";
    return;
  }

  const idx = window._despesas.findIndex((d) => d.id === _idParaExcluir);
  if (idx < 0) {
    fecharModalExclusao();
    return;
  }

  const desp = window._despesas[idx];

  if (desp.status === "pago") {
    if (senha !== ADMIN_PASSWORD) {
      erroSenha.textContent = "Senha inválida.";
      return;
    }
  }

  const user = getUsuarioAtual();
  const agoraISO = new Date().toISOString().slice(0, 10);

  const modo =
    document.querySelector("input[name='modoExclusao']:checked")?.value ||
    "unico";

  if (desp.recorrente === "mensal" && modo !== "unico") {
    window._despesas = window._despesas.map((d) => {
      if (d.descricao !== desp.descricao) return d;
      if (d.empresa !== desp.empresa) return d;
      if (modo === "futuras" && d.vencimento < desp.vencimento) return d;

      return {
        ...d,
        excluido: true,
        motivoExclusao: motivo,
        excluidoPor: user ? user.email : null,
        dataExclusao: agoraISO,
      };
    });
  } else {
    window._despesas[idx] = {
      ...desp,
      excluido: true,
      motivoExclusao: motivo,
      excluidoPor: user ? user.email : null,
      dataExclusao: agoraISO,
    };
  }

  salvarDespesas();
  registrarLog("excluir", desp, { motivo, modo });

  showLoader();
  try {
    aplicarFiltros();
    renderizarCalendario();
  } finally {
    hideLoader();
  }

  fecharModalExclusao();
}

function alterarStatus(id, novoStatus) {
  const idx = window._despesas.findIndex((d) => d.id === id);
  if (idx < 0) return;

  const antiga = window._despesas[idx];
  const hojeISO = new Date().toISOString().slice(0, 10);

  const atualizado = {
    ...antiga,
    status: novoStatus,
    dataPagamento: novoStatus === "pago" ? hojeISO : null,
  };

  window._despesas[idx] = atualizado;
  salvarDespesas();
  registrarLog("alterar_status", atualizado, {
    statusAnterior: antiga.status,
    statusNovo: novoStatus,
  });

  showLoader();
  try {
    aplicarFiltros();
    renderizarCalendario();
  } finally {
    hideLoader();
  }
}

// ================== ENVIO WHATSAPP ==================
function abrirModalResultadoEnvio(envios, erroGeral) {
  const modal = document.getElementById("modalResultadoEnvio");
  const lista = document.getElementById("resultadoEnvioLista");
  if (!modal || !lista) return;

  lista.innerHTML = "";

  if (erroGeral) {
    const div1 = document.createElement("div");
    div1.style.fontSize = "0.9rem";
    div1.style.color = "#fecaca";
    div1.textContent =
      "Ocorreu um erro geral ao enviar as mensagens para o servidor de WhatsApp.";

    const div2 = document.createElement("div");
    div2.style.fontSize = "0.78rem";
    div2.style.color = "#9ca3af";
    div2.style.marginTop = "4px";
    div2.textContent =
      "Tente novamente em alguns instantes ou verifique o status do serviço.";

    lista.appendChild(div1);
    lista.appendChild(div2);
  } else if (!envios || !envios.length) {
    const div1 = document.createElement("div");
    div1.style.fontSize = "0.9rem";
    div1.style.color = "#e5e7eb";
    div1.textContent = "Nenhuma mensagem foi enviada.";

    const div2 = document.createElement("div");
    div2.style.fontSize = "0.78rem";
    div2.style.color = "#9ca3af";
    div2.style.marginTop = "4px";
    div2.textContent =
      "Verifique se as despesas selecionadas possuem contatos válidos para notificação.";

    lista.appendChild(div1);
    lista.appendChild(div2);
  } else {
    const topo = document.createElement("div");
    topo.style.fontSize = "0.85rem";
    topo.style.marginBottom = "8px";
    topo.style.color = "#bbf7d0";
    topo.textContent = `✅ Envio concluído. Mensagens enviadas para ${envios.length} contato(s):`;
    lista.appendChild(topo);

    envios.forEach((e) => {
      const item = document.createElement("div");
      item.className = "item-dia";

      const linha1 = document.createElement("div");
      linha1.className = "item-dia-desc";
      linha1.textContent = `${e.nome || "Contato"} (${e.telefone})`;

      const detalhes = document.createElement("div");
      detalhes.className = "item-dia-email";

      let vencPtbr = "";
      if (e.vencimento) {
        vencPtbr = e.vencimento.split("-").reverse().join("/");
      }

      detalhes.textContent = `Descr.: ${
        e.descricao || "-"
      } • Venc.: ${vencPtbr || "-"}`;

      item.appendChild(linha1);
      item.appendChild(detalhes);
      lista.appendChild(item);
    });
  }

  modal.style.display = "flex";
}

function fecharModalResultadoEnvio() {
  const modal = document.getElementById("modalResultadoEnvio");
  if (modal) modal.style.display = "none";
}

function abrirModalSelecionarEnvio() {
  const ano = mesAtual.getFullYear();
  const mes = mesAtual.getMonth();

  const inicioISO = new Date(ano, mes, 1).toISOString().slice(0, 10);
  const fimISO = new Date(ano, mes + 1, 0).toISOString().slice(0, 10);

  const lista = document.getElementById("listaSelecionarEnvio");
  if (!lista) return;
  lista.innerHTML = "";

  const candidatos = (window._despesas || []).filter((d) => {
    if (d.excluido) return false;
    if (d.empresa !== EMPRESA_ATUAL) return false;
    if (!d.vencimento) return false;
    if (!Array.isArray(d.responsaveis) || !d.responsaveis.length) return false;
    return d.vencimento >= inicioISO && d.vencimento <= fimISO;
  });

  if (!candidatos.length) {
    const vazio = document.createElement("div");
    vazio.style.fontSize = "0.85rem";
    vazio.style.color = "#9ca3af";
    vazio.textContent =
      "Nenhuma despesa cadastrada neste mês com contatos para notificação.";
    lista.appendChild(vazio);
  } else {
    candidatos.forEach((d) => {
      const row = document.createElement("label");
      row.className = "item-dia";
      row.style.cursor = "pointer";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "chk-envio";
      checkbox.value = d.id;
      checkbox.style.marginRight = "8px";

      const texto = document.createElement("div");
      texto.style.display = "flex";
      texto.style.flexDirection = "column";

      const linha1 = document.createElement("span");
      linha1.textContent = `${d.descricao} – vence em ${d.vencimento
        .split("-")
        .reverse()
        .join("/")}`;

      const linha2 = document.createElement("span");
      linha2.style.fontSize = "0.8rem";
      linha2.style.color = "#9ca3af";

      if (Array.isArray(d.responsaveis) && d.responsaveis.length) {
        linha2.textContent =
          "Notificar: " +
          d.responsaveis
            .map((r) => {
              const tipoLabel =
                r.tipo === "informativo" ? "informar" : "responsável";
              return `${r.nome} (${r.telefone}, ${tipoLabel})`;
            })
            .join(" / ");
      } else {
        linha2.textContent = "Sem contatos cadastrados para notificação.";
      }

      texto.appendChild(linha1);
      texto.appendChild(linha2);

      row.appendChild(checkbox);
      row.appendChild(texto);

      lista.appendChild(row);
    });
  }

  document.getElementById("modalSelecionarEnvio").style.display = "flex";
}

async function confirmarEnvioSelecionado() {
  const chkList = document.querySelectorAll(
    "#listaSelecionarEnvio .chk-envio"
  );

  const idsSelecionados = [];
  chkList.forEach((chk) => {
    if (chk.checked) idsSelecionados.push(Number(chk.value));
  });

  if (!idsSelecionados.length) {
    alert("Selecione pelo menos uma despesa para envio.");
    return;
  }

  const despesasSelecionadas = (window._despesas || []).filter(
    (d) =>
      idsSelecionados.includes(d.id) &&
      !d.excluido &&
      d.empresa === EMPRESA_ATUAL
  );

  if (!despesasSelecionadas.length) {
    alert("Não foi possível localizar as despesas selecionadas.");
    return;
  }

  const user = typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  const usuarioEmail = user ? user.email : null;

  const payload = {
    empresa: EMPRESA_ATUAL,
    usuarioEmail,
    lembretes: despesasSelecionadas,
  };

  showLoader();

  let erroGeral = null;
  let resposta = null;

  try {
    const resp = await fetch(
      `${window.WHATSAPP_BASE}/api/enviar-lembretes`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(
        `HTTP ${resp.status} ao enviar-lembretes: ${txt || "sem detalhes"}`
      );
    }

    resposta = await resp.json();
    console.log("Resposta envio WhatsApp:", resposta);
  } catch (e) {
    console.error("Erro ao enviar lembretes para WhatsApp:", e);
    erroGeral = e;
  } finally {
    hideLoader();
  }

  document.getElementById("modalSelecionarEnvio").style.display = "none";

  if (erroGeral) {
    abrirModalResultadoEnvio([], true);
  } else if (resposta && Array.isArray(resposta.envios)) {
    abrirModalResultadoEnvio(resposta.envios, false);
  } else {
    abrirModalResultadoEnvio([], false);
  }
}

function fecharModalSelecionarEnvio() {
  const m = document.getElementById("modalSelecionarEnvio");
  if (m) m.style.display = "none";
}

// ================== Expor funções globais ==================
window.initPagina = initPagina;
window.mudarMes = mudarMes;
window.abrirGerenciadorContatos = abrirGerenciadorContatos;
window.abrirModalInclusao = abrirModalInclusao;
window.fecharModalInclusao = fecharModalInclusao;
window.fecharModalContato = fecharModalContato;
window.fecharModalDia = fecharModalDia;
window.fecharModalExclusao = fecharModalExclusao;
window.confirmarExclusaoDespesa = confirmarExclusaoDespesa;
window.abrirModalSelecionarEnvio = abrirModalSelecionarEnvio;
window.confirmarEnvioSelecionado = confirmarEnvioSelecionado;
window.fecharModalSelecionarEnvio = fecharModalSelecionarEnvio;
window.fecharModalResultadoEnvio = fecharModalResultadoEnvio;
window.onChangeBuscaTexto = onChangeBuscaTexto;
window.onChangeFiltroStatus = onChangeFiltroStatus;
window.onChangeFiltroPeriodo = onChangeFiltroPeriodo;
window.salvarDespesa = salvarDespesa;
window.adicionarContatoSelecionado = adicionarContatoSelecionado;
window.adicionarContatoRapido = adicionarContatoRapido;
window.habilitarBuscaTexto = habilitarBuscaTexto;
window.trocarEmpresa = trocarEmpresa;
