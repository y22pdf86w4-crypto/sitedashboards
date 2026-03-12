// ================== CONFIG API BASE (ALINHADO COM logistica.js) ==================

if (window.APIBASE === undefined) {
  const DEFAULT_LOGISTICA_API_BASE =
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
  const LOGISTICA_SCRIPT_TAG = document.currentScript;
  const LOGISTICA_API_BASE =
    LOGISTICA_SCRIPT_TAG?.dataset?.apiBase || DEFAULT_LOGISTICA_API_BASE;
  window.APIBASE = LOGISTICA_API_BASE;
}
console.log("visya.js carregado. APIBASE =", window.APIBASE);

// AUTH HELPER JWT
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

// Wrapper genérico
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

const vMotoristaSelect = document.getElementById("motorista");
const vCaminhaoSelect = document.getElementById("caminhao");
const vTipoOperacaoSelect = document.getElementById("tipoOperacao");
const vCampoCarregamentoRel = document.getElementById("campo-carregamento-rel");
const vClienteHidden = document.getElementById("clienteId");
const vObsInput = document.getElementById("observacoes");
const vCarregamentoRelInput = document.getElementById("idOperacaoCarregamentoRel");
const vTbody = document.getElementById("visya-tbody");
const vStatusDiv = document.getElementById("visya-status");
const vInfoRegistros = document.getElementById("visyaInfoRegistros");

// filtros
const fTipoOperacao = document.getElementById("fTipoOperacao");
const fStatusOperacao = document.getElementById("fStatusOperacao");
const fMotoristaNome = document.getElementById("fMotoristaNome");
const fCaminhaoPlaca = document.getElementById("fCaminhaoPlaca");
const fClienteNome = document.getElementById("fClienteNome");
const btnFiltrarOperacoes = document.getElementById("btnFiltrarOperacoes");
const btnLimparFiltros = document.getElementById("btnLimparFiltros");

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
const btnRecarregar = document.getElementById("btnRecarregar"); // opcional, se quiser reaproveitar

// cliente busca
const clienteBuscaInput = document.getElementById("clienteBusca");
const clienteSugestoesDiv = document.getElementById("clienteSugestoes");

// Modal
const vDetModal = document.getElementById("visyaDetalheModal");
const vDetFechar = document.getElementById("visyaDetalheFechar");

const vDetId = document.getElementById("visyaDetId");
const vDetTipo = document.getElementById("visyaDetTipo");
const vDetStatus = document.getElementById("visyaDetStatus");
const vDetMotorista = document.getElementById("visyaDetMotorista");
const vDetCaminhao = document.getElementById("visyaDetCaminhao");
const vDetClienteId = document.getElementById("visyaDetClienteId");
const vDetClienteNome = document.getElementById("visyaDetClienteNome");
const vDetInicioSep = document.getElementById("visyaDetInicioSep");
const vDetFimSep = document.getElementById("visyaDetFimSep");
const vDetInicioDesc = document.getElementById("visyaDetInicioDesc");
const vDetFimDesc = document.getElementById("visyaDetFimDesc");
const vDetObs = document.getElementById("visyaDetObs");
const vDetFotosLista = document.getElementById("visyaDetFotosLista");
const vDetStatusMsg = document.getElementById("visyaDetStatusMsg");

// Foto
const vFotoInput = document.getElementById("visyaFotoInput");
const vBtnCapturarFoto = document.getElementById("visyaBtnCapturarFoto");
const vFotoPreviewWrapper = document.getElementById("visyaFotoPreviewWrapper");
const vFotoPreview = document.getElementById("visyaFotoPreview");
const vBtnEnviarFoto = document.getElementById("visyaBtnEnviarFoto");

let visyaOperacaoAtualId = null;
let visyaFotoFileAtual = null;

let cacheOperacoes = [];
let cacheClientesVisya = [];

// ================== HELPERS UI ==================

function visyaSetStatus(msg, ok = true) {
  if (!vStatusDiv) return;
  vStatusDiv.textContent = msg;
  vStatusDiv.classList.remove("vz-status--ok", "vz-status--error");
  vStatusDiv.classList.add(ok ? "vz-status--ok" : "vz-status--error");
}

function visyaAbrirModalDetalhe() {
  if (!vDetModal) return;
  vDetModal.style.display = "flex";
}

function visyaFecharModalDetalhe() {
  if (!vDetModal) return;
  vDetModal.style.display = "none";
  visyaOperacaoAtualId = null;
  visyaFotoFileAtual = null;
  if (vFotoPreviewWrapper) vFotoPreviewWrapper.style.display = "none";
  if (vFotoPreview) vFotoPreview.src = "";
  if (vDetStatusMsg) {
    vDetStatusMsg.textContent = "";
    vDetStatusMsg.classList.remove("vz-status--ok", "vz-status--error");
  }
}

if (vDetFechar) {
  vDetFechar.addEventListener("click", visyaFecharModalDetalhe);
}
if (vDetModal) {
  vDetModal.addEventListener("click", (ev) => {
    if (ev.target === vDetModal) visyaFecharModalDetalhe();
  });
}

function visyaFormatarDataHora(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

// ================== CARGA DIMENSÕES ==================

async function visyaCarregarMotoristas() {
  if (!vMotoristaSelect) return;
  try {
    const data = await apiGetJson("/motoristas?ativo=true");
    vMotoristaSelect.innerHTML = '<option value="">Selecione...</option>';
    (data || []).forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.idMotorista;
      opt.textContent = m.nome;
      vMotoristaSelect.appendChild(opt);
    });
  } catch (e) {
    console.error(e);
    visyaSetStatus("Erro ao carregar motoristas", false);
  }
}

async function visyaCarregarCaminhoes() {
  if (!vCaminhaoSelect) return;
  try {
    const data = await apiGetJson("/caminhoes?ativo=true");
    vCaminhaoSelect.innerHTML = '<option value="">Selecione...</option>';
    (data || []).forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.idCaminhao;
      opt.textContent = `${c.placa} - ${c.descricao || ""}`;
      vCaminhaoSelect.appendChild(opt);
    });
  } catch (e) {
    console.error(e);
    visyaSetStatus("Erro ao carregar caminhões", false);
  }
}

// CLIENTES LOGISTICA
async function visyaCarregarClientes() {
  try {
    const data = await apiGetJson("/logistica/clientes");
    cacheClientesVisya = (data && Array.isArray(data.clientes)) ? data.clientes : [];
    console.log("[VISYA][visyaCarregarClientes] clientes recebidos:", cacheClientesVisya);
  } catch (e) {
    console.error("[VISYA][visyaCarregarClientes] erro:", e);
    visyaSetStatus("Erro ao carregar clientes", false);
  }
}

function visyaAtualizarSugestoesClientes() {
  if (!clienteBuscaInput || !clienteSugestoesDiv) return;
  const termo = clienteBuscaInput.value.trim().toLowerCase();
  if (!termo) {
    clienteSugestoesDiv.style.display = "none";
    clienteSugestoesDiv.innerHTML = "";
    return;
  }

  const maxSugestoes = 20;
  const filtrados = cacheClientesVisya.filter((c) => {
    const cod = String(c.id || c.codigo || "").toLowerCase();
    const nome = String(c.nome || "").toLowerCase();
    return cod.includes(termo) || nome.includes(termo);
  }).slice(0, maxSugestoes);

  if (!filtrados.length) {
    clienteSugestoesDiv.style.display = "none";
    clienteSugestoesDiv.innerHTML = "";
    return;
  }

  clienteSugestoesDiv.innerHTML = "";
  filtrados.forEach((c) => {
    const item = document.createElement("div");
    item.className = "visya-cliente-sugestoes-item";
    const spanNome = document.createElement("span");
    spanNome.className = "nome";
    spanNome.textContent = `${c.id} - ${c.nome}`;
    const spanEnd = document.createElement("span");
    spanEnd.className = "endereco";
    spanEnd.textContent = c.endereco || "";
    item.appendChild(spanNome);
    item.appendChild(spanEnd);

    item.addEventListener("click", () => {
      if (vClienteHidden) vClienteHidden.value = c.id;
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
    if (vClienteHidden) vClienteHidden.value = "";
    visyaAtualizarSugestoesClientes();
  });

  clienteBuscaInput.addEventListener("focus", () => {
    visyaAtualizarSugestoesClientes();
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

function visyaAplicarFiltrosLocal() {
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

  visyaRenderOperacoes(filtrado);
}

function visyaRenderOperacoes(lista) {
  if (!vTbody) return;

  vTbody.innerHTML = "";

  if (!lista.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 9;
    td.className = "empty-state";
    td.textContent = "Nenhuma operação encontrada.";
    tr.appendChild(td);
    vTbody.appendChild(tr);
    if (vInfoRegistros) vInfoRegistros.textContent = "Nenhuma operação encontrada";
    visyaAtualizarCardsResumo([]);
    return;
  }

  if (vInfoRegistros) {
    vInfoRegistros.textContent = `Mostrando ${lista.length} operação(ões)`;
  }

  visyaAtualizarCardsResumo(lista);

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
      ? visyaFormatarDataHora(op.inicioSeparacao)
      : "";
    const sepFim = op.fimSeparacao
      ? visyaFormatarDataHora(op.fimSeparacao)
      : "";
    const sepTempo = op.tempoSeparacaoMinutos ?? "";
    tdSep.innerHTML = `
      <div>${sepIni}</div>
      <div>${sepFim}</div>
      <div>${sepTempo ? sepTempo + " min" : ""}</div>
    `;

    const tdDesc = document.createElement("td");
    const descIni = op.inicioDescarga
      ? visyaFormatarDataHora(op.inicioDescarga)
      : "";
    const descFim = op.fimDescarga
      ? visyaFormatarDataHora(op.fimDescarga)
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
    btnAbrir.className = "btn-clear";
    btnAbrir.style.fontSize = "0.75rem";
    btnAbrir.addEventListener("click", () => {
      visyaCarregarDetalheOperacao(op.idOperacao);
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

    vTbody.appendChild(tr);
  });
}

function visyaAtualizarCardsResumo(lista) {
  if (!Array.isArray(lista)) lista = [];
  let hoje = 0, pend = 0, and = 0, concl = 0;
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

async function visyaCarregarOperacoes() {
  if (!vTbody) return;
  try {
    const data = await apiGetJson("/visya/operacoes");
    cacheOperacoes = Array.isArray(data) ? data : [];
    visyaAplicarFiltrosLocal();
  } catch (e) {
    console.error(e);
    visyaSetStatus("Erro ao carregar operações", false);
  }
}

// ================== DETALHE ==================

async function visyaCarregarDetalheOperacao(idOperacao) {
  try {
    const data = await apiGetJson(`/visya/operacoes/${idOperacao}`);

    visyaOperacaoAtualId = data.idOperacao;

    if (vDetId) vDetId.textContent = `#${data.idOperacao}`;
    if (vDetTipo) vDetTipo.textContent = data.tipoOperacao || "";
    if (vDetStatus) vDetStatus.textContent = data.statusOperacao || "";

    if (vDetMotorista) {
      vDetMotorista.textContent =
        (data.nomeMotorista || "") +
        (data.idMotorista ? ` (ID ${data.idMotorista})` : "");
    }
    if (vDetCaminhao) {
      vDetCaminhao.textContent =
        (data.placaCaminhao || "") +
        (data.idCaminhao ? ` (ID ${data.idCaminhao})` : "");
    }

    if (vDetClienteId) vDetClienteId.textContent = data.idCliente || "";
    if (vDetClienteNome) vDetClienteNome.textContent = data.nomeCliente || "";

    if (vDetInicioSep) vDetInicioSep.textContent = visyaFormatarDataHora(data.inicioSeparacao);
    if (vDetFimSep) vDetFimSep.textContent = visyaFormatarDataHora(data.fimSeparacao);
    if (vDetInicioDesc)
      vDetInicioDesc.textContent = visyaFormatarDataHora(data.inicioDescarga);
    if (vDetFimDesc) vDetFimDesc.textContent = visyaFormatarDataHora(data.fimDescarga);

    if (vDetObs) vDetObs.textContent = data.observacoes || "";

    if (vDetFotosLista) {
      vDetFotosLista.innerHTML = "";
      const fotos = Array.isArray(data.fotos) ? data.fotos : [];
      if (!fotos.length) {
        const span = document.createElement("span");
        span.textContent = "Nenhuma foto registrada.";
        span.style.fontSize = "0.8rem";
        span.style.color = "#9ca3af";
        vDetFotosLista.appendChild(span);
      } else {
        fotos.forEach((f) => {
          const div = document.createElement("div");
          div.className = "visya-det-foto-thumb";
          const img = document.createElement("img");
          img.src = f.urlImagem;
          img.alt = f.tipo || "Foto";
          div.appendChild(img);
          div.addEventListener("click", () => {
            window.open(f.urlImagem, "_blank");
          });
          vDetFotosLista.appendChild(div);
        });
      }
    }

    if (vDetStatusMsg) {
      vDetStatusMsg.textContent = "";
      vDetStatusMsg.classList.remove("vz-status--ok", "vz-status--error");
    }

    visyaAbrirModalDetalhe();
  } catch (e) {
    console.error("[VISYA] Erro ao carregar detalhe:", e);
    if (vDetStatusMsg) {
      vDetStatusMsg.textContent = e.message || "Erro ao carregar detalhes da operação.";
      vDetStatusMsg.classList.remove("vz-status--ok");
      vDetStatusMsg.classList.add("vz-status--error");
    }
  }
}

// ================== CRIAÇÃO OPERAÇÃO ==================

async function visyaCriarOperacao() {
  const tipoOperacao = vTipoOperacaoSelect ? vTipoOperacaoSelect.value : "";
  const idMotorista = vMotoristaSelect ? vMotoristaSelect.value : "";
  const idCaminhao = vCaminhaoSelect ? vCaminhaoSelect.value : "";
  const idCliente = vClienteHidden ? vClienteHidden.value || null : null;
  const observacoes = vObsInput ? vObsInput.value || null : null;
  const idOperacaoCarregamentoRel = vCarregamentoRelInput
    ? vCarregamentoRelInput.value || null
    : null;

  if (!tipoOperacao || !idMotorista || !idCaminhao) {
    visyaSetStatus("Preencha tipo, motorista e caminhão.", false);
    return;
  }

  if (!idCliente) {
    visyaSetStatus("Selecione um cliente pela busca de nome/código.", false);
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

  try {
    const created = await apiPostJson("/visya/operacoes", payload);
    visyaSetStatus(`Operação criada com sucesso (ID ${created.idOperacao}).`, true);

    if (vTipoOperacaoSelect) vTipoOperacaoSelect.value = "";
    if (vMotoristaSelect) vMotoristaSelect.value = "";
    if (vCaminhaoSelect) vCaminhaoSelect.value = "";
    if (vClienteHidden) vClienteHidden.value = "";
    if (clienteBuscaInput) clienteBuscaInput.value = "";
    if (vObsInput) vObsInput.value = "";
    if (vCarregamentoRelInput) vCarregamentoRelInput.value = "";
    if (vCampoCarregamentoRel) vCampoCarregamentoRel.style.display = "none";

    await visyaCarregarOperacoes();
  } catch (e) {
    console.error(e);
    visyaSetStatus(e.message || "Erro ao criar operação.", false);
  }
}

// ================== FOTO (MODAL) ==================

if (vBtnCapturarFoto && vFotoInput) {
  vBtnCapturarFoto.addEventListener("click", () => {
    if (!visyaOperacaoAtualId) {
      if (vDetStatusMsg) {
        vDetStatusMsg.textContent = "Abra uma operação antes de anexar fotos.";
        vDetStatusMsg.classList.remove("vz-status--ok");
        vDetStatusMsg.classList.add("vz-status--error");
      }
      return;
    }
    vFotoInput.click();
  });
}

if (vFotoInput) {
  vFotoInput.addEventListener("change", () => {
    const file = vFotoInput.files && vFotoInput.files[0];
    if (!file) return;

    visyaFotoFileAtual = file;
    const url = URL.createObjectURL(file);
    if (vFotoPreview) vFotoPreview.src = url;
    if (vFotoPreviewWrapper) vFotoPreviewWrapper.style.display = "flex";
  });
}

if (vBtnEnviarFoto) {
  vBtnEnviarFoto.addEventListener("click", async () => {
    if (!visyaOperacaoAtualId || !visyaFotoFileAtual) {
      if (vDetStatusMsg) {
        vDetStatusMsg.textContent = "Nenhuma foto selecionada.";
        vDetStatusMsg.classList.remove("vz-status--ok");
        vDetStatusMsg.classList.add("vz-status--error");
      }
      return;
    }

    try {
      await apiPostFile(
        `/visya/operacoes/${visyaOperacaoAtualId}/fotos`,
        visyaFotoFileAtual,
        null
      );

      if (vDetStatusMsg) {
        vDetStatusMsg.textContent = "Foto enviada com sucesso.";
        vDetStatusMsg.classList.remove("vz-status--error");
        vDetStatusMsg.classList.add("vz-status--ok");
      }

      visyaFotoFileAtual = null;
      if (vFotoPreviewWrapper) vFotoPreviewWrapper.style.display = "none";
      if (vFotoPreview) vFotoPreview.src = "";
      vFotoInput.value = "";

      await visyaCarregarDetalheOperacao(visyaOperacaoAtualId);
    } catch (e) {
      console.error(e);
      if (vDetStatusMsg) {
        vDetStatusMsg.textContent = e.message || "Erro ao enviar foto.";
        vDetStatusMsg.classList.remove("vz-status--ok");
        vDetStatusMsg.classList.add("vz-status--error");
      }
    }
  });
}

// ================== BOOTSTRAP ==================

window.addEventListener("DOMContentLoaded", () => {
  console.log("[VISYA] DOMContentLoaded");

  const app = document.getElementById("app");
  const btnToggle = document.getElementById("btnToggleSidebar");
  if (app && btnToggle) {
    btnToggle.addEventListener("click", () => {
      app.classList.toggle("sidebar-collapsed");
    });
  }

  if (vTipoOperacaoSelect && vCampoCarregamentoRel) {
    vTipoOperacaoSelect.addEventListener("change", () => {
      if (vTipoOperacaoSelect.value === "DESCARGA") {
        vCampoCarregamentoRel.style.display = "flex";
      } else {
        vCampoCarregamentoRel.style.display = "none";
      }
    });
  }

  if (btnCriarOperacao) {
    btnCriarOperacao.addEventListener("click", visyaCriarOperacao);
  }

  if (btnRecarregar) {
    btnRecarregar.addEventListener("click", () => {
      visyaCarregarOperacoes();
    });
  }

  if (btnAbrirNovaOperacao && novaOperacaoPanel) {
    btnAbrirNovaOperacao.addEventListener("click", () => {
      novaOperacaoPanel.style.display = "block";
    });
  }

  if (btnFecharNovaOperacao && novaOperacaoPanel) {
    btnFecharNovaOperacao.addEventListener("click", () => {
      novaOperacaoPanel.style.display = "none";
      visyaSetStatus("", true);
    });
  }

  if (btnFiltrarOperacoes) {
    btnFiltrarOperacoes.addEventListener("click", visyaAplicarFiltrosLocal);
  }

  if (btnLimparFiltros) {
    btnLimparFiltros.addEventListener("click", () => {
      if (fTipoOperacao) fTipoOperacao.value = "";
      if (fStatusOperacao) fStatusOperacao.value = "";
      if (fMotoristaNome) fMotoristaNome.value = "";
      if (fCaminhaoPlaca) fCaminhaoPlaca.value = "";
      if (fClienteNome) fClienteNome.value = "";
      visyaAplicarFiltrosLocal();
    });
  }

  (async () => {
    await visyaCarregarMotoristas();
    await visyaCarregarCaminhoes();
    await visyaCarregarClientes();
    await visyaCarregarOperacoes();
  })();
});
