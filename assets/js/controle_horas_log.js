// ================== CONFIG API BASE (ALINHADO COM logistica.js) ==================

if (window.APIBASE === undefined) {
  const DEFAULT_LOGISTICA_API_BASE =
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
  const SCRIPT_TAG = document.currentScript;
  const API_BASE =
    SCRIPT_TAG?.dataset?.apiBase || DEFAULT_LOGISTICA_API_BASE;
  window.APIBASE = API_BASE;
}
console.log("controle_horas_log.js carregado. APIBASE =", window.APIBASE);

// ================== LOADER GLOBAL ==================

function showLoaderControle() {
  const overlay = document.getElementById("loaderOverlay");
  if (!overlay) {
    console.warn("[CONTROLE] loaderOverlay não encontrado");
    return;
  }
  overlay.setAttribute("aria-hidden", "false");
  overlay.style.display = "flex";
}

function hideLoaderControle() {
  const overlay = document.getElementById("loaderOverlay");
  if (!overlay) return;
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.display = "none";
}

// ================== AUTH / API WRAPPERS ==================

function getAuthHeaders() {
  try {
    const token =
      (window.sessionStorage && sessionStorage.getItem("authToken")) || null;
    if (!token) return;
    return {
      Authorization: "Bearer " + token
    };
  } catch (e) {
    console.warn("Erro ao recuperar authToken do sessionStorage:", e);
    return;
  }
}

async function apiFetch(path, options = {}) {
  const url = window.APIBASE + path;
  const resp = await fetch(url, {
    method: options.method || "GET",
    headers: {
      ...(options.headers || {}),
      ...(getAuthHeaders() || {})
    },
    body: options.body === undefined ? undefined : options.body
  });
  return resp;
}

async function apiGetJson(path) {
  const resp = await apiFetch(path);
  if (!resp.ok) throw new Error("HTTP " + resp.status + " GET " + path);
  return resp.json();
}

async function apiPostJson(path, bodyObj) {
  const resp = await apiFetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(bodyObj || {})
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error("HTTP " + resp.status + " POST " + path + " - " + txt);
  }
  return resp.json();
}

async function apiPostFile(path, file, extraFields) {
  const formData = new FormData();
  formData.append("arquivo", file);
  if (extraFields) {
    Object.entries(extraFields).forEach(([k, v]) => {
      if (v != null) formData.append(k, v);
    });
  }

  const resp = await apiFetch(path, {
    method: "POST",
    body: formData
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error("HTTP " + resp.status + " POST " + path + " - " + txt);
  }
  return resp.json();
}

// ================== ELEMENTOS DA TELA ==================

const cMotoristaSelect = document.getElementById("motorista");
const cCaminhaoSelect = document.getElementById("caminhao");
const cTipoOperacaoSelect = document.getElementById("tipoOperacao");
const cCampoCarregamentoRel = document.getElementById("campo-carregamento-rel");
const cClienteHidden = document.getElementById("clienteId");
const cObsInput = document.getElementById("observacoes");
const cCarregamentoRelInput = document.getElementById("idOperacaoCarregamentoRel");
const cTbody = document.getElementById("controle-tbody");
const cStatusDiv = document.getElementById("controle-status");
const cInfoRegistros = document.getElementById("controleInfoRegistros");

// filtros
const fTipoOperacao = document.getElementById("fTipoOperacao");
const fStatusOperacao = document.getElementById("fStatusOperacao");
const fMotoristaNome = document.getElementById("fMotoristaNome");
const fCaminhaoPlaca = document.getElementById("fCaminhaoPlaca");
const fClienteNome = document.getElementById("fClienteNome");
const btnFiltrarOperacoes = document.getElementById("btnFiltrarOperacoes");
const btnLimparFiltros = document.getElementById("btnLimparFiltros");
const btnRecarregar = document.getElementById("btnRecarregar");

// cards
const cardOpsHoje = document.getElementById("cardOpsHoje");
const cardOpsPendentes = document.getElementById("cardOpsPendentes");
const cardOpsAndamento = document.getElementById("cardOpsAndamento");
const cardOpsConcluidas = document.getElementById("cardOpsConcluidas");

// painel nova operação
const novaOperacaoPanel = document.getElementById("novaOperacaoPanel");
const btnAbrirNovaOperacao = document.getElementById("btnAbrirNovaOperacao");
const btnFecharNovaOperacao = document.getElementById("btnFecharNovaOperacao");
const btnCriarOperacao = document.getElementById("btnCriarOperacao");

// cliente busca
const clienteBuscaInput = document.getElementById("clienteBusca");
const clienteSugestoesDiv = document.getElementById("clienteSugestoes");

// Modal detalhe
const cDetModal = document.getElementById("controleDetalheModal");
const cDetFechar = document.getElementById("controleDetalheFechar");

const cDetId = document.getElementById("controleDetId");
const cDetTipo = document.getElementById("controleDetTipo");
const cDetStatus = document.getElementById("controleDetStatus");
const cDetMotorista = document.getElementById("controleDetMotorista");
const cDetCaminhao = document.getElementById("controleDetCaminhao");
const cDetClienteId = document.getElementById("controleDetClienteId");
const cDetClienteNome = document.getElementById("controleDetClienteNome");
const cDetInicioSep = document.getElementById("controleDetInicioSep");
const cDetFimSep = document.getElementById("controleDetFimSep");
const cDetInicioDesc = document.getElementById("controleDetInicioDesc");
const cDetFimDesc = document.getElementById("controleDetFimDesc");
const cDetObs = document.getElementById("controleDetObs");
const cDetFotosLista = document.getElementById("controleDetFotosLista");
const cDetStatusMsg = document.getElementById("controleDetStatusMsg");

// Foto
const cFotoInput = document.getElementById("controleFotoInput");
const cBtnCapturarFoto = document.getElementById("controleBtnCapturarFoto");
const cFotoPreviewWrapper = document.getElementById("controleFotoPreviewWrapper");
const cFotoPreview = document.getElementById("controleFotoPreview");
const cBtnEnviarFoto = document.getElementById("controleBtnEnviarFoto");

let controleOperacaoAtualId = null;
let controleFotoFileAtual = null;

let cacheOperacoes = [];
let cacheClientesControle = [];

// ================== HELPERS UI ==================

function controleSetStatus(msg, ok = true) {
  if (!cStatusDiv) return;
  cStatusDiv.textContent = msg;
  cStatusDiv.classList.remove("vz-status--ok", "vz-status--error");
  if (msg) {
    cStatusDiv.classList.add(ok ? "vz-status--ok" : "vz-status--error");
  }
}

function controleAbrirModalDetalhe() {
  if (!cDetModal) return;
  cDetModal.style.display = "flex";
}

function controleFecharModalDetalhe() {
  if (!cDetModal) return;
  cDetModal.style.display = "none";
  controleOperacaoAtualId = null;
  controleFotoFileAtual = null;
  if (cFotoPreviewWrapper) cFotoPreviewWrapper.style.display = "none";
  if (cFotoPreview) cFotoPreview.src = "";
  if (cDetStatusMsg) {
    cDetStatusMsg.textContent = "";
    cDetStatusMsg.classList.remove("vz-status--ok", "vz-status--error");
  }
}

if (cDetFechar) {
  cDetFechar.addEventListener("click", controleFecharModalDetalhe);
}
if (cDetModal) {
  cDetModal.addEventListener("click", (ev) => {
    if (ev.target === cDetModal) controleFecharModalDetalhe();
  });
}

function controleFormatarDataHora(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

// ================== CARGA DIMENSÕES ==================

async function controleCarregarMotoristas() {
  if (!cMotoristaSelect) return;
  try {
    const data = await apiGetJson("/motoristas?ativo=true");
    cMotoristaSelect.innerHTML = '<option value="">Selecione...</option>';
    (data || []).forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.idMotorista;
      opt.textContent = m.nome;
      cMotoristaSelect.appendChild(opt);
    });
  } catch (e) {
    console.error(e);
    controleSetStatus("Erro ao carregar motoristas", false);
  }
}

async function controleCarregarCaminhoes() {
  if (!cCaminhaoSelect) return;
  try {
    const data = await apiGetJson("/caminhoes?ativo=true");
    cCaminhaoSelect.innerHTML = '<option value="">Selecione...</option>';
    (data || []).forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.idCaminhao;
      opt.textContent = `${c.placa} - ${c.descricao || ""}`;
      cCaminhaoSelect.appendChild(opt);
    });
  } catch (e) {
    console.error(e);
    controleSetStatus("Erro ao carregar caminhões", false);
  }
}

// CLIENTES
async function controleCarregarClientes() {
  try {
    const data = await apiGetJson("/logistica/clientes");
    cacheClientesControle = (data && Array.isArray(data.clientes)) ? data.clientes : [];
    console.log("[CONTROLE][controleCarregarClientes] clientes recebidos:", cacheClientesControle);
  } catch (e) {
    console.error("[CONTROLE][controleCarregarClientes] erro:", e);
    controleSetStatus("Erro ao carregar clientes", false);
  }
}

function controleAtualizarSugestoesClientes() {
  if (!clienteBuscaInput || !clienteSugestoesDiv) return;
  const termo = clienteBuscaInput.value.trim().toLowerCase();
  if (!termo) {
    clienteSugestoesDiv.style.display = "none";
    clienteSugestoesDiv.innerHTML = "";
    return;
  }

  const maxSugestoes = 20;
  const filtrados = cacheClientesControle
    .filter((c) => {
      const cod = String(c.id || c.codigo || "").toLowerCase();
      const nome = String(c.nome || "").toLowerCase();
      return cod.includes(termo) || nome.includes(termo);
    })
    .slice(0, maxSugestoes);

  if (!filtrados.length) {
    clienteSugestoesDiv.style.display = "none";
    clienteSugestoesDiv.innerHTML = "";
    return;
  }

  clienteSugestoesDiv.innerHTML = "";
  filtrados.forEach((c) => {
    const item = document.createElement("div");
    item.className = "controle-cliente-sugestoes-item";
    const spanNome = document.createElement("span");
    spanNome.className = "nome";
    spanNome.textContent = `${c.id} - ${c.nome}`;
    const spanEnd = document.createElement("span");
    spanEnd.className = "endereco";
    spanEnd.textContent = c.endereco || "";
    item.appendChild(spanNome);
    item.appendChild(spanEnd);

    item.addEventListener("click", () => {
      if (cClienteHidden) cClienteHidden.value = c.id;
      clienteBuscaInput.value = `${c.id} - ${c.nome}`;
      clienteSugestoesDiv.style.display = "none";
      clienteSugestoesDiv.innerHTML = "";
    });

    clienteSugestoesDiv.appendChild(item);
  });

  clienteSugestoesDiv.style.display = "block";
}

if (clienteBuscaInput) {
  clienteBuscaInput.addEventListener("input", () => {
    if (cClienteHidden) cClienteHidden.value = "";
    controleAtualizarSugestoesClientes();
  });

  clienteBuscaInput.addEventListener("focus", () => {
    controleAtualizarSugestoesClientes();
  });

  document.addEventListener("click", (ev) => {
    if (!clienteSugestoesDiv) return;
    if (
      ev.target !== clienteBuscaInput &&
      !clienteSugestoesDiv.contains(ev.target)
    ) {
      clienteSugestoesDiv.style.display = "none";
    }
  });
}

// ================== LISTAGEM / FILTROS ==================

function controleAplicarFiltrosLocal() {
  const tipo = fTipoOperacao ? fTipoOperacao.value : "";
  const status = fStatusOperacao ? fStatusOperacao.value : "";
  const mot = fMotoristaNome ? fMotoristaNome.value.trim().toLowerCase() : "";
  const cam = fCaminhaoPlaca ? fCaminhaoPlaca.value.trim().toLowerCase() : "";
  const cli = fClienteNome ? fClienteNome.value.trim().toLowerCase() : "";

  const filtrado = cacheOperacoes.filter((op) => {
    if (tipo && op.tipoOperacao !== tipo) return false;
    if (status && op.statusOperacao !== status) return false;

    if (mot) {
      const nome = String(op.nomeMotorista || "").toLowerCase();
      if (!nome.includes(mot)) return false;
    }

    if (cam) {
      const placa = String(op.placaCaminhao || "").toLowerCase();
      const idCam = String(op.idCaminhao || "").toLowerCase();
      if (!placa.includes(cam) && !idCam.includes(cam)) return false;
    }

    if (cli) {
      const idCli = String(op.idCliente || "").toLowerCase();
      const nomeCli = String(op.nomeCliente || "").toLowerCase();
      if (!idCli.includes(cli) && !nomeCli.includes(cli)) return false;
    }

    return true;
  });

  controleRenderOperacoes(filtrado);
}

function controleRenderOperacoes(lista) {
  if (!cTbody) return;

  cTbody.innerHTML = "";

  if (!lista.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 9;
    td.className = "empty-state";
    td.textContent = "Nenhuma operação encontrada.";
    tr.appendChild(td);
    cTbody.appendChild(tr);
    if (cInfoRegistros) cInfoRegistros.textContent = "Nenhuma operação encontrada";
    controleAtualizarCardsResumo([]);
    return;
  }

  if (cInfoRegistros) {
    cInfoRegistros.textContent = `Mostrando ${lista.length} operação(ões)`;
  }

  controleAtualizarCardsResumo(lista);

  lista.forEach((op) => {
    const tr = document.createElement("tr");

    const tdId = document.createElement("td");
    tdId.textContent = op.idOperacao;

    const tdTipo = document.createElement("td");
    tdTipo.textContent = op.tipoOperacao;

    const tdMot = document.createElement("td");
    tdMot.textContent = op.nomeMotorista || op.idMotorista;

    const tdCam = document.createElement("td");
    tdCam.textContent = op.placaCaminhao || op.idCaminhao;

    const tdCli = document.createElement("td");
    const cliId = op.idCliente || "";
    const cliNome = op.nomeCliente || "";
    tdCli.textContent = cliId
      ? `${cliId}${cliNome ? " - " + cliNome : ""}`
      : "";

    const tdStatus = document.createElement("td");
    tdStatus.textContent = op.statusOperacao;

    const tdSep = document.createElement("td");
    const sepIni = op.inicioSeparacao
      ? controleFormatarDataHora(op.inicioSeparacao)
      : "";
    const sepFim = op.fimSeparacao
      ? controleFormatarDataHora(op.fimSeparacao)
      : "";
    const sepTempo = op.tempoSeparacaoMinutos ?? "";
    tdSep.innerHTML = `
      <div>${sepIni}</div>
      <div>${sepFim}</div>
      <div>${sepTempo ? sepTempo + " min" : ""}</div>
    `;

    const tdDesc = document.createElement("td");
    const descIni = op.inicioDescarga
      ? controleFormatarDataHora(op.inicioDescarga)
      : "";
    const descFim = op.fimDescarga
      ? controleFormatarDataHora(op.fimDescarga)
      : "";
    const descTempo = op.tempoDescargaMinutos ?? "";
    tdDesc.innerHTML = `
      <div>${descIni}</div>
      <div>${descFim}</div>
      <div>${descTempo ? descTempo + " min" : ""}</div>
    `;

    const tdAction = document.createElement("td");
    const btnAbrir = document.createElement("button");
    btnAbrir.type = "button";
    btnAbrir.textContent = "Detalhes";
    btnAbrir.className = "btn-filtro btn-filtro-secundario";
    btnAbrir.style.fontSize = "0.7rem";
    btnAbrir.addEventListener("click", () => {
      controleCarregarDetalheOperacao(op.idOperacao);
    });
    tdAction.appendChild(btnAbrir);

    tr.appendChild(tdId);
    tr.appendChild(tdTipo);
    tr.appendChild(tdMot);
    tr.appendChild(tdCam);
    tr.appendChild(tdCli);
    tr.appendChild(tdStatus);
    tr.appendChild(tdSep);
    tr.appendChild(tdDesc);
    tr.appendChild(tdAction);

    cTbody.appendChild(tr);
  });
}

function controleAtualizarCardsResumo(lista) {
  if (!Array.isArray(lista)) lista = [];
  let hoje = 0,
    pend = 0,
    and = 0,
    concl = 0;
  const hojeStr = new Date().toISOString().slice(0, 10);

  lista.forEach((op) => {
    const criado = op.criadoEm || op.dataCriacao;
    if (criado && String(criado).startsWith(hojeStr)) hoje++;
    if (op.statusOperacao === "PENDENTE") pend++;
    if (op.statusOperacao === "EM_ANDAMENTO") and++;
    if (op.statusOperacao === "CONCLUIDO") concl++;
  });

  if (cardOpsHoje) cardOpsHoje.textContent = hoje;
  if (cardOpsPendentes) cardOpsPendentes.textContent = pend;
  if (cardOpsAndamento) cardOpsAndamento.textContent = and;
  if (cardOpsConcluidas) cardOpsConcluidas.textContent = concl;
}

async function controleCarregarOperacoes() {
  if (!cTbody) return;
  showLoaderControle();
  try {
    const data = await apiGetJson("/visya/operacoes");
    cacheOperacoes = Array.isArray(data) ? data : [];
    controleAplicarFiltrosLocal();
  } catch (e) {
    console.error(e);
    controleSetStatus("Erro ao carregar operações", false);
  } finally {
    hideLoaderControle();
  }
}

// ================== DETALHE ==================

async function controleCarregarDetalheOperacao(idOperacao) {
  try {
    const data = await apiGetJson(`/visya/operacoes/${idOperacao}`);

    controleOperacaoAtualId = data.idOperacao;

    if (cDetId) cDetId.textContent = `#${data.idOperacao}`;
    if (cDetTipo) cDetTipo.textContent = data.tipoOperacao || "";
    if (cDetStatus) cDetStatus.textContent = data.statusOperacao || "";

    if (cDetMotorista) {
      cDetMotorista.textContent =
        (data.nomeMotorista || "") +
        (data.idMotorista ? ` (ID ${data.idMotorista})` : "");
    }
    if (cDetCaminhao) {
      cDetCaminhao.textContent =
        (data.placaCaminhao || "") +
        (data.idCaminhao ? ` (ID ${data.idCaminhao})` : "");
    }

    if (cDetClienteId) cDetClienteId.textContent = data.idCliente || "";
    if (cDetClienteNome) cDetClienteNome.textContent = data.nomeCliente || "";

    if (cDetInicioSep)
      cDetInicioSep.textContent = controleFormatarDataHora(data.inicioSeparacao);
    if (cDetFimSep)
      cDetFimSep.textContent = controleFormatarDataHora(data.fimSeparacao);
    if (cDetInicioDesc)
      cDetInicioDesc.textContent = controleFormatarDataHora(data.inicioDescarga);
    if (cDetFimDesc)
      cDetFimDesc.textContent = controleFormatarDataHora(data.fimDescarga);

    if (cDetObs) cDetObs.textContent = data.observacoes || "";

    if (cDetFotosLista) {
      cDetFotosLista.innerHTML = "";
      const fotos = Array.isArray(data.fotos) ? data.fotos : [];
      if (!fotos.length) {
        const span = document.createElement("span");
        span.textContent = "Nenhuma foto registrada.";
        span.style.fontSize = "0.8rem";
        span.style.color = "#9ca3af";
        cDetFotosLista.appendChild(span);
      } else {
        fotos.forEach((f) => {
          const div = document.createElement("div");
          div.className = "controle-det-foto-thumb";
          const img = document.createElement("img");
          img.src = f.urlImagem;
          img.alt = f.tipo || "Foto";
          div.appendChild(img);
          div.addEventListener("click", () => {
            window.open(f.urlImagem, "_blank");
          });
          cDetFotosLista.appendChild(div);
        });
      }
    }

    if (cDetStatusMsg) {
      cDetStatusMsg.textContent = "";
      cDetStatusMsg.classList.remove("vz-status--ok", "vz-status--error");
    }

    controleAbrirModalDetalhe();
  } catch (e) {
    console.error("[CONTROLE] Erro ao carregar detalhe:", e);
    if (cDetStatusMsg) {
      cDetStatusMsg.textContent =
        e.message || "Erro ao carregar detalhes da operação.";
      cDetStatusMsg.classList.remove("vz-status--ok");
      cDetStatusMsg.classList.add("vz-status--error");
    }
  }
}

// ================== CRIAÇÃO OPERAÇÃO ==================

async function controleCriarOperacao() {
  const tipoOperacao = cTipoOperacaoSelect ? cTipoOperacaoSelect.value : "";
  const idMotorista = cMotoristaSelect ? cMotoristaSelect.value : "";
  const idCaminhao = cCaminhaoSelect ? cCaminhaoSelect.value : "";
  const idCliente = cClienteHidden ? cClienteHidden.value || null : null;
  const observacoes = cObsInput ? cObsInput.value || null : null;
  const idOperacaoCarregamentoRel = cCarregamentoRelInput
    ? cCarregamentoRelInput.value || null
    : null;

  if (!tipoOperacao || !idMotorista || !idCaminhao) {
    controleSetStatus("Preencha tipo, motorista e caminhão.", false);
    return;
  }

  if (!idCliente) {
    controleSetStatus("Selecione um cliente pela busca de nome/código.", false);
    return;
  }

  const payload = {
    tipoOperacao,
    idMotorista: Number(idMotorista),
    idCaminhao: Number(idCaminhao),
    idCliente: idCliente ? Number(idCliente) : null,
    observacoes
  };

  if (tipoOperacao === "DESCARGA" && idOperacaoCarregamentoRel) {
    payload.idOperacaoCarregamentoRel = Number(idOperacaoCarregamentoRel);
  }

  showLoaderControle();
  try {
    const created = await apiPostJson("/visya/operacoes", payload);
    controleSetStatus(
      `Operação criada com sucesso (ID ${created.idOperacao}).`,
      true
    );

    if (cTipoOperacaoSelect) cTipoOperacaoSelect.value = "";
    if (cMotoristaSelect) cMotoristaSelect.value = "";
    if (cCaminhaoSelect) cCaminhaoSelect.value = "";
    if (cClienteHidden) cClienteHidden.value = "";
    if (clienteBuscaInput) clienteBuscaInput.value = "";
    if (cObsInput) cObsInput.value = "";
    if (cCarregamentoRelInput) cCarregamentoRelInput.value = "";
    if (cCampoCarregamentoRel) cCampoCarregamentoRel.style.display = "none";

    await controleCarregarOperacoes();
  } catch (e) {
    console.error(e);
    controleSetStatus(e.message || "Erro ao criar operação.", false);
  } finally {
    hideLoaderControle();
  }
}

// ================== FOTO (MODAL) ==================

if (cBtnCapturarFoto && cFotoInput) {
  cBtnCapturarFoto.addEventListener("click", () => {
    if (!controleOperacaoAtualId) {
      if (cDetStatusMsg) {
        cDetStatusMsg.textContent =
          "Abra uma operação antes de anexar fotos.";
        cDetStatusMsg.classList.remove("vz-status--ok");
        cDetStatusMsg.classList.add("vz-status--error");
      }
      return;
    }
    cFotoInput.click();
  });
}

if (cFotoInput) {
  cFotoInput.addEventListener("change", () => {
    const file = cFotoInput.files && cFotoInput.files[0];
    if (!file) return;

    controleFotoFileAtual = file;
    const url = URL.createObjectURL(file);
    if (cFotoPreview) cFotoPreview.src = url;
    if (cFotoPreviewWrapper) cFotoPreviewWrapper.style.display = "flex";
  });
}

if (cBtnEnviarFoto) {
  cBtnEnviarFoto.addEventListener("click", async () => {
    if (!controleOperacaoAtualId || !controleFotoFileAtual) {
      if (cDetStatusMsg) {
        cDetStatusMsg.textContent = "Nenhuma foto selecionada.";
        cDetStatusMsg.classList.remove("vz-status--ok");
        cDetStatusMsg.classList.add("vz-status--error");
      }
      return;
    }

    showLoaderControle();
    try {
      await apiPostFile(
        `/visya/operacoes/${controleOperacaoAtualId}/fotos`,
        controleFotoFileAtual,
        null
      );

      if (cDetStatusMsg) {
        cDetStatusMsg.textContent = "Foto enviada com sucesso.";
        cDetStatusMsg.classList.remove("vz-status--error");
        cDetStatusMsg.classList.add("vz-status--ok");
      }

      controleFotoFileAtual = null;
      if (cFotoPreviewWrapper) cFotoPreviewWrapper.style.display = "none";
      if (cFotoPreview) cFotoPreview.src = "";
      cFotoInput.value = "";

      await controleCarregarDetalheOperacao(controleOperacaoAtualId);
    } catch (e) {
      console.error(e);
      if (cDetStatusMsg) {
        cDetStatusMsg.textContent = e.message || "Erro ao enviar foto.";
        cDetStatusMsg.classList.remove("vz-status--ok");
        cDetStatusMsg.classList.add("vz-status--error");
      }
    } finally {
      hideLoaderControle();
    }
  });
}

// ================== BOOTSTRAP ==================

window.addEventListener("DOMContentLoaded", () => {
  console.log("[CONTROLE] DOMContentLoaded");

  if (cTipoOperacaoSelect && cCampoCarregamentoRel) {
    cTipoOperacaoSelect.addEventListener("change", () => {
      if (cTipoOperacaoSelect.value === "DESCARGA") {
        cCampoCarregamentoRel.style.display = "flex";
      } else {
        cCampoCarregamentoRel.style.display = "none";
      }
    });
  }

  if (btnCriarOperacao) {
    btnCriarOperacao.addEventListener("click", controleCriarOperacao);
  }

  if (btnRecarregar) {
    btnRecarregar.addEventListener("click", () => {
      controleCarregarOperacoes();
    });
  }

  if (btnAbrirNovaOperacao && novaOperacaoPanel) {
    btnAbrirNovaOperacao.addEventListener("click", () => {
      novaOperacaoPanel.style.display = "block";
      controleSetStatus("", true);
    });
  }

  if (btnFecharNovaOperacao && novaOperacaoPanel) {
    btnFecharNovaOperacao.addEventListener("click", () => {
      novaOperacaoPanel.style.display = "none";
      controleSetStatus("", true);
    });
  }

  if (btnFiltrarOperacoes) {
    btnFiltrarOperacoes.addEventListener("click", controleAplicarFiltrosLocal);
  }

  if (btnLimparFiltros) {
    btnLimparFiltros.addEventListener("click", () => {
      if (fTipoOperacao) fTipoOperacao.value = "";
      if (fStatusOperacao) fStatusOperacao.value = "";
      if (fMotoristaNome) fMotoristaNome.value = "";
      if (fCaminhaoPlaca) fCaminhaoPlaca.value = "";
      if (fClienteNome) fClienteNome.value = "";
      controleAplicarFiltrosLocal();
    });
  }

  (async () => {
    showLoaderControle();
    try {
      await controleCarregarMotoristas();
      await controleCarregarCaminhoes();
      await controleCarregarClientes();
      await controleCarregarOperacoes();
    } catch (e) {
      console.error("[CONTROLE] Erro no bootstrap:", e);
      controleSetStatus("Erro ao inicializar tela de controle.", false);
    } finally {
      hideLoaderControle();
    }
  })();
});