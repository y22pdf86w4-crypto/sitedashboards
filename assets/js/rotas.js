// assets/js/rotas.js

// ================== CONFIG API BASE ==================

if (!window.API_BASE && window.APIBASE === undefined) {
  window.API_BASE =
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
}

if (window.APIBASE === undefined) {
  const DEFAULT_LOGISTICA_API_BASE =
    window.API_BASE ||
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
  const LOGISTICA_SCRIPT_TAG = document.currentScript;
  const LOGISTICA_API_BASE =
    LOGISTICA_SCRIPT_TAG?.dataset?.apiBase || DEFAULT_LOGISTICA_API_BASE;
  window.APIBASE = LOGISTICA_API_BASE;
}

console.log("[ROTAS] rotas.js carregado. APIBASE =", window.APIBASE);

// ================== LOADER LOCAL DE ROTAS (usa loaderOverlay global) ==================

let rotasLoaderTimerId = null;

function showRotasLoader() {
  const overlay = document.getElementById("loaderOverlay");
  if (!overlay) {
    console.warn("[ROTAS] loaderOverlay global não encontrado no DOM");
    return;
  }

  // mesmo comportamento do estoque: só mostra se passar de 50ms
  if (rotasLoaderTimerId !== null) {
    clearTimeout(rotasLoaderTimerId);
  }
  rotasLoaderTimerId = setTimeout(() => {
    overlay.setAttribute("aria-hidden", "false");
    overlay.style.display = "flex";
  }, 50);
}

function hideRotasLoader() {
  const overlay = document.getElementById("loaderOverlay");
  if (!overlay) return;

  if (rotasLoaderTimerId !== null) {
    clearTimeout(rotasLoaderTimerId);
    rotasLoaderTimerId = null;
  }

  overlay.setAttribute("aria-hidden", "true");
  overlay.style.display = "none";
}
// ================== AUTH HELPER JWT ==================

function getAuthHeadersRotas() {
  try {
    const token =
      (window.sessionStorage && sessionStorage.getItem("authToken")) || null;
    if (!token) return;
    return {
      Authorization: "Bearer " + token
    };
  } catch (e) {
    console.warn("[ROTAS] Erro ao recuperar authToken do sessionStorage:", e);
    return;
  }
}

async function apiFetch(path, options = {}) {
  const url = window.APIBASE + path;
  const resp = await fetch(url, {
    method: options.method || "GET",
    headers: {
      ...(options.headers || {}),
      ...(getAuthHeadersRotas() || {})
    },
    body: options.body === undefined ? undefined : options.body
  });
  return resp;
}

// CONSTANTES DE LIMITE
const LIMITE_PONTOS_ROTA = 80;

// TOMTOM TRAFFIC FLOW
const TOMTOM_API_KEY = "l22aGTuKjY30e1lAcUqAup3XZ8pYzCOb";

const tomtomTrafficLayer = L.tileLayer(
  "https://api.tomtom.com/traffic/map/4/tile/flow/absolute/{z}/{x}/{y}.png?key=" +
    TOMTOM_API_KEY,
  {
    opacity: 0.7,
    attribution: "© TomTom"
  }
);

function toggleTraffic(ativo) {
  if (ativo) {
    tomtomTrafficLayer.addTo(map);
  } else {
    map.removeLayer(tomtomTrafficLayer);
  }
}

// TOMTOM TRAFFIC INCIDENTS
let incidentMarkers = [];

function escolherIconePorCategoria(cat) {
  let color = "#2563eb";
  if (cat === 1) color = "#ef4444";
  else if (cat === 6) color = "#f97316";
  else if (cat === 8) color = "#111827";
  else if (cat === 9) color = "#eab308";

  return L.divIcon({
    className: "incident-marker-wrapper",
    html: `<div class="incident-marker" style="
        width:14px;
        height:14px;
        border-radius:50%;
        background:${color};
        border:2px solid #0f172a;
        box-shadow:0 0 6px rgba(15,23,42,0.8);
      "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

function traduzirDescricaoTomTom(desc) {
  if (!desc) return "Incidente de trânsito";
  const d = String(desc).toLowerCase();
  if (d.includes("queuing traffic")) return "Trânsito em fila / lento";
  if (d.includes("stationary traffic")) return "Trânsito parado";
  return desc;
}

async function carregarIncidentesTomTom() {
  showRotasLoader();
  try {
    incidentMarkers.forEach(m => map.removeLayer(m));
    incidentMarkers = [];

    const bounds = map.getBounds();
    const minLat = bounds.getSouth();
    const minLon = bounds.getWest();
    const maxLat = bounds.getNorth();
    const maxLon = bounds.getEast();

    if (map.getZoom() < 9) {
      console.log(
        "[ROTAS] Zoom muito baixo para incidentes, pulando chamada TomTom"
      );
      return;
    }

    const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
    const path = `/logistica/tomtom/incidentes?bbox=${encodeURIComponent(
      bbox
    )}`;

    const resp = await apiFetch(path);
    if (!resp.ok) {
      console.warn("[ROTAS] Incidentes HTTP", resp.status);
      return;
    }
    const data = await resp.json();
    (data.incidents || []).forEach(inc => {
      const props = inc.properties;
      const geom = inc.geometry;
      const cat = props.iconCategory;
      const evt = props.events && props.events[0];
      const descrOriginal = evt?.description || "Incidente de trânsito";
      const descr = traduzirDescricaoTomTom(descrOriginal);

      let lat = null;
      let lon = null;
      if (geom.type === "Point") {
        const coords = geom.coordinates;
        lon = coords[0];
        lat = coords[1];
      } else if (geom.type === "LineString") {
        const coords = geom.coordinates || [];
        if (coords.length === 0) return;
        const mid = Math.floor(coords.length / 2);
        lon = coords[mid][0];
        lat = coords[mid][1];
      }
      if (lat == null || lon == null) return;

      const marker = L.marker([lat, lon], {
        icon: escolherIconePorCategoria(cat)
      }).bindPopup(descr);

      marker.addTo(map);
      incidentMarkers.push(marker);
    });
  } catch (e) {
    console.warn("[ROTAS] Erro ao carregar incidentes TomTom:", e);
  } finally {
    hideRotasLoader();
  }
}

// MAPA
const map = L.map("map", {
  zoomSnap: 0.25,
  zoomDelta: 0.5,
  wheelDebounceTime: 20,
  wheelPxPerZoomLevel: 80,
  attributionControl: false
}).setView([-19.5, -40.3], 7);

L.Marker.prototype.options.icon = L.divIcon({
  className: "",
  html: "",
  iconSize: null
});

const OpenStreetMapFrance = L.tileLayer(
  "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
  {
    maxZoom: 20,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }
);
OpenStreetMapFrance.addTo(map);
map.doubleClickZoom.disable();

// ESTADO
let routingControl = null;
let clienteMarkers = {};
let todosMarkersRota = [];
let ultimaRotaWaypoints = null;

let cacheClientes = null;
let cachePedidosPendentes = null;
let cacheCarteira = null;
let cacheVendedores = null;

let clientesFiltradosAtuais = null;
let paginaClientes = 0;
const TAMANHO_PAGINA = 30;
let carregandoMais = false;

let ultimaAnaliseRota = null;
let rotaDebounceTimeout = null;
let dragListaConfigurado = false;

let idsSelecionados = new Set();
let origemAtual = "pedidos"; // "pedidos" | "clientes" | "carteira"

// origem fixa para o ponto de partida
const ORIGEM_FIXA = {
  lat: -19.383869647653956,
  lng: -40.067551247607746
};

let marcadorLocalizacao = null;
// começa na origem fixa, mas pode ser arrastado depois
let origemManual = { ...ORIGEM_FIXA };

let pontosManuais = [];
let manualIdSeq = 1;

const myLocationIcon = L.divIcon({
  className: "",
  html: `<div class="pin-minha-localizacao"></div>`,
  iconSize: [26, 34],
  iconAnchor: [13, 26]
});

// DOM
const listaClientesDiv = document.getElementById("listaClientes");
const contadorClientesSpan = document.getElementById("contadorClientes");
const contadorSelecionadosSpan = document.getElementById(
  "contadorSelecionados"
);
const resumoSelecionadosDiv = document.getElementById("resumoSelecionados");
const alertasRota = document.getElementById("alertasRota");
const alertasRotaSidebar = document.getElementById("alertasRotaSidebar");
const filtroNomeInput = document.getElementById("filtroNome");
const btnGerarLinkMapsSidebar = document.getElementById(
  "btnGerarLinkMapsSidebar"
);
const chkEvitarPedagios = document.getElementById("chkEvitarPedagios");
const chkEvitarPontes = document.getElementById("chkEvitarPontes");
const linkMapsDiv = document.getElementById("linkMaps");

// seletor de origem e vendedores
const tipoOrigemSelect = document.getElementById("tipoOrigem");
const grupoVendedoresDiv = document.getElementById("grupoVendedores");
const selectVendedor = document.getElementById("selectVendedor");

// trânsito
let chkVerTransito = document.getElementById("chkVerTransito");
if (!chkVerTransito) chkVerTransito = chkEvitarPontes;

// painel rota
const rotaListaDiv = document.getElementById("rotaListaPontos");
const novoPontoInput = document.getElementById("novoPontoInput");
const btnAdicionarPonto = document.getElementById("btnAdicionarPonto");
const rotaPanel = document.getElementById("rota-panel");
const rotaPanelHeader = document.getElementById("rota-panel-header");
const rotaPanelMinimize = document.getElementById("rotaPanelMinimize");
const destinoCampoPainel = document.getElementById("destinoCampoPainel");
const btnGerarRota = document.getElementById("btnGerarRota");
const btnGerarLinkMaps = document.getElementById("btnGerarLinkMaps");
const btnSelecionarTodos = document.getElementById("btnSelecionarTodos");
const btnLimparSelecao = document.getElementById("btnLimparSelecao");
const btnOtimizarRota = document.getElementById("btnOtimizarRota");

// HELPERS
function getDestinoCampo() {
  return destinoCampoPainel.value.trim();
}

function setAlertasTexto(texto) {
  alertasRota.textContent = texto;
  alertasRotaSidebar.textContent = texto;
}

function setLinkMapsEnabled(enabled) {
  btnGerarLinkMaps.disabled = !enabled;
  btnGerarLinkMapsSidebar.disabled = !enabled;
}

// remove todos os markers de rota/cliente do mapa
function removerTodosMarkersDoMapa() {
  todosMarkersRota.forEach(m => {
    if (map.hasLayer(m)) map.removeLayer(m);
  });
  todosMarkersRota = [];
  Object.values(clienteMarkers).forEach(m => {
    if (map.hasLayer(m)) map.removeLayer(m);
  });
  clienteMarkers = {};
}

// monta string de endereço
function montarEnderecoPadrao(item) {
  const partes = [];
  if (item.logradouro) {
    let log = item.logradouro;
    if (item.numero) log += ", " + item.numero;
    partes.push(log);
  }
  const linha2 = [];
  if (item.bairro) linha2.push(item.bairro);
  if (item.cidade) linha2.push(item.cidade);
  if (item.uf) linha2.push(item.uf);
  if (linha2.length) partes.push(linha2.join(" - "));
  if (item.cep) partes.push("CEP " + item.cep);
  return partes.join(" | ");
}

function criarMarkerNumerado(lat, lng, numero, titulo, pontoRef) {
  const html = `
    <div class="marker-numero">
      <div class="marker-numero-label">${numero}</div>
    </div>
  `;
  const icon = L.divIcon({
    className: "marker-numero-wrapper",
    html,
    iconSize: [26, 26],
    iconAnchor: [13, 26]
  });

  const marker = L.marker([lat, lng], {
    icon,
    draggable: true
  }).bindPopup(titulo);

  marker.on("dragend", e => {
    const { lat: newLat, lng: newLng } = e.target.getLatLng();
    if (pontoRef.tipo === "cliente") {
      const base = getCacheAtual();
      const c = base.find(x => x.id === pontoRef.id);
      if (c) {
        c.lat = newLat;
        c.lng = newLng;
      }
    } else if (pontoRef.tipo === "manual") {
      const p = pontosManuais.find(x => x.id === pontoRef.id);
      if (p) {
        p.lat = newLat;
        p.lng = newLng;
      }
    }
    gerarRotaAuto();
  });

  return marker;
}

// COORDENADAS SEGURAS
function normalizarLat(valor) {
  if (valor == null) return null;
  if (typeof valor === "number") {
    return Number.isFinite(valor) && valor >= -90 && valor <= 90 ? valor : null;
  }
  const s = String(valor).trim();
  if (!s) return null;
  if (s.includes("e") || s.includes("E")) return null;
  const n = parseFloat(s.replace(",", "."));
  if (!Number.isFinite(n) || n < -90 || n > 90) return null;
  return n;
}

function normalizarLng(valor) {
  if (valor == null) return null;
  if (typeof valor === "number") {
    return Number.isFinite(valor) && valor >= -180 && valor <= 180
      ? valor
      : null;
  }
  const s = String(valor).trim();
  if (!s) return null;
  if (s.includes("e") || s.includes("E")) return null;
  const n = parseFloat(s.replace(",", "."));
  if (!Number.isFinite(n) || n < -180 || n > 180) return null;
  return n;
}

// PARSE lat,lng texto
function parseLatLngText(txt) {
  if (!txt) return null;
  const parts = txt.split(",");
  if (parts.length !== 2) return null;
  const lat = parts[0].trim();
  const lng = parts[1].trim();
  if (!lat || !lng) return null;
  return { lat, lng };
}

// GEOCODE BACKEND (com loader)
async function geocodeTexto(texto) {
  const path = `/geocode?q=${encodeURIComponent(texto)}`;
  showRotasLoader();
  try {
    const resp = await apiFetch(path);
    if (!resp.ok) {
      console.error("[ROTAS] Erro HTTP no geocode:", resp.status);
      return null;
    }
    const data = await resp.json();
    if (data && data.lat != null && data.lng != null) {
      return {
        lat: data.lat,
        lng: data.lng,
        label: texto
      };
    }
    return null;
  } catch (e) {
    console.error("[ROTAS] Erro ao chamar geocode:", e);
    return null;
  } finally {
    hideRotasLoader();
  }
}

// LISTA / SELEÇÃO
function atualizarResumoSelecionados() {
  const qtde = idsSelecionados.size;
  if (qtde === 0) {
    resumoSelecionadosDiv.textContent = "Nenhum cliente selecionado.";
  } else if (qtde === 1) {
    resumoSelecionadosDiv.textContent = "1 cliente selecionado.";
  } else {
    resumoSelecionadosDiv.textContent = qtde + " clientes selecionados.";
  }
}

function atualizarContadorSelecionados() {
  const qtde = idsSelecionados.size;
  contadorSelecionadosSpan.textContent = qtde + " selecionados";
  atualizarResumoSelecionados();

  if (qtde === 0 && pontosManuais.length === 0) {
    limparRota();
    rotaListaDiv.innerHTML = "";
    return;
  }
  reconstruirPainelRota();
  gerarRotaAuto();
}

// Selecionar até 20 primeiros visíveis
function marcarTodosVisiveis(marcar) {
  const itens = Array.from(
    listaClientesDiv.querySelectorAll(".cliente-item .cliente-checkbox")
  );
  const limite = 50;
  let count = 0;

  itens.forEach(cb => {
    const id = parseInt(cb.value, 10);
    const wrapper = cb.closest(".cliente-item");
    const semLoc = wrapper?.classList.contains("cliente-sem-localizacao");
    if (semLoc) {
      cb.checked = false;
      idsSelecionados.delete(id);
      return;
    }

    if (marcar) {
      if (count >= limite) return;
      cb.checked = true;
      idsSelecionados.add(id);
      count++;
    } else {
      cb.checked = false;
      idsSelecionados.delete(id);
    }
  });

  atualizarContadorSelecionados();
}

function criarItemCliente(c) {
  const div = document.createElement("div");
  div.className = "cliente-item";
  div.draggable = false; // drag manual
  div.dataset.id = c.id;

  const checkWrap = document.createElement("label");
  checkWrap.className = "checkbox-wrapper checkbox-sm checkbox-cliente";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "cliente-checkbox";
  checkbox.value = c.id;

  const checkmark = document.createElement("div");
  checkmark.className = "checkmark";
  checkmark.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M20 6L9 17L4 12" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const spanLabelVis = document.createElement("span");
  spanLabelVis.className = "label";
  spanLabelVis.textContent = "";

  checkWrap.appendChild(checkbox);
  checkWrap.appendChild(checkmark);
  checkWrap.appendChild(spanLabelVis);

  const textos = document.createElement("div");
  textos.className = "cliente-textos";

  const spanNome = document.createElement("span");
  spanNome.className = "nome";
  const nomePrincipal =
    c.origemTipo === "pedido"
      ? `${c.nunota} - ${c.nome}`
      : `${c.codigo} - ${c.nome}`;
  spanNome.textContent = nomePrincipal;

  const spanBadge = document.createElement("span");
  spanBadge.className = "badge";
  spanBadge.textContent = c.endereco || "";

  const spanAlerta = document.createElement("span");
  spanAlerta.className = "badge alerta";
  spanAlerta.style.display = "none";
  spanAlerta.textContent = "endereço não localizado";

  const latValida = normalizarLat(c.lat) != null;
  const lngValida = normalizarLng(c.lng) != null;
  const semLocalizacao = !latValida || !lngValida;

  if (semLocalizacao) {
    spanAlerta.style.display = "inline-block";
    div.classList.add("cliente-sem-localizacao");
    checkbox.disabled = true;
    checkWrap.classList.add("checkbox-desabilitado");
  }

  checkbox.addEventListener("change", () => {
    if (semLocalizacao) {
      checkbox.checked = false;
      return;
    }
    if (checkbox.checked) {
      idsSelecionados.add(c.id);
    } else {
      idsSelecionados.delete(c.id);
    }
    atualizarContadorSelecionados();
    div.classList.toggle("selecionado", checkbox.checked);
  });

  textos.appendChild(spanNome);
  textos.appendChild(spanBadge);
  textos.appendChild(spanAlerta);
  div.appendChild(checkWrap);
  div.appendChild(textos);

  return div;
}

function configurarDragAndDropLista() {
  if (dragListaConfigurado) return;
  dragListaConfigurado = true;

  let draggingItem = null;

  listaClientesDiv.addEventListener("mousedown", e => {
    const item = e.target.closest(".cliente-item");
    if (!item) return;

    // se clicou em checkbox / label, não começa drag
    if (e.target.closest("input, label, .checkmark")) return;

    draggingItem = item;
    item.classList.add("dragging");
    document.body.style.userSelect = "none";

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  function onMouseMove(e) {
    if (!draggingItem) return;

    const afterElement = getDragAfterElement(
      listaClientesDiv,
      e.clientY,
      ".cliente-item:not(.dragging)"
    );

    if (!afterElement) {
      listaClientesDiv.appendChild(draggingItem);
    } else {
      listaClientesDiv.insertBefore(draggingItem, afterElement);
    }
  }

  function onMouseUp() {
    if (!draggingItem) return;
    draggingItem.classList.remove("dragging");
    draggingItem = null;
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }
}

function limparListaClientesVisual() {
  listaClientesDiv.innerHTML = "";
  contadorSelecionadosSpan.textContent = idsSelecionados.size + " selecionados";
  atualizarResumoSelecionados();
}

function renderClientesPagina() {
  if (!clientesFiltradosAtuais || clientesFiltradosAtuais.length === 0) {
    limparListaClientesVisual();
    contadorClientesSpan.textContent = "0 clientes";
    return;
  }

  const inicio = paginaClientes * TAMANHO_PAGINA;
  if (inicio >= clientesFiltradosAtuais.length) return;

  const fim = Math.min(
    inicio + TAMANHO_PAGINA,
    clientesFiltradosAtuais.length
  );

  const frag = document.createDocumentFragment();
  for (let i = inicio; i < fim; i++) {
    const c = clientesFiltradosAtuais[i];
    const div = criarItemCliente(c);
    if (idsSelecionados.has(c.id)) {
      const cb = div.querySelector(".cliente-checkbox");
      if (cb && !cb.disabled) {
        cb.checked = true;
        if (!div.classList.contains("cliente-sem-localizacao")) {
          div.classList.add("selecionado");
        }
      }
    }
    frag.appendChild(div);
  }

  listaClientesDiv.appendChild(frag);
  paginaClientes += 1;

  contadorClientesSpan.textContent =
    clientesFiltradosAtuais.length + " clientes";
}

function renderClientes(clientes) {
  clientesFiltradosAtuais = clientes;
  paginaClientes = 0;
  limparListaClientesVisual();
  renderClientesPagina();
  configurarDragAndDropLista();
}

// INFINITE SCROLL
function configurarInfiniteScrollClientes() {
  listaClientesDiv.addEventListener("scroll", () => {
    if (carregandoMais) return;
    const scrollBottom =
      listaClientesDiv.scrollTop + listaClientesDiv.clientHeight;
    const limite = listaClientesDiv.scrollHeight - 40;
    if (scrollBottom >= limite) {
      const inicio = paginaClientes * TAMANHO_PAGINA;
      if (!clientesFiltradosAtuais || inicio >= clientesFiltradosAtuais.length)
        return;
      carregandoMais = true;
      setTimeout(() => {
        renderClientesPagina();
        carregandoMais = false;
      }, 0);
    }
  });
}

// ORIGENS / APIS
function getCacheAtual() {
  if (origemAtual === "pedidos") return cachePedidosPendentes || [];
  if (origemAtual === "clientes") return cacheClientes || [];
  if (origemAtual === "carteira") return cacheCarteira || [];
  return [];
}

async function carregarPedidosPendentes(codvendFiltro) {
  showRotasLoader();
  try {
    listaClientesDiv.innerHTML = "";

    let path = "/pedidos-pendentes";
    if (codvendFiltro) {
      const sep = path.includes("?") ? "&" : "?";
      path += `${sep}codvend=${encodeURIComponent(codvendFiltro)}`;
    }
    console.log("[ROTAS] GET pedidos pendentes em", window.APIBASE + path);

    const resp = await apiFetch(path);
    if (!resp.ok) {
      console.error("[ROTAS] Erro HTTP em pedidos pendentes:", resp.status);
      cachePedidosPendentes = [];
      return;
    }

    const data = await resp.json();
    cachePedidosPendentes = (data.pedidos || []).map(p => {
      const endereco = montarEnderecoPadrao(p);
      return {
        id: p.NUNOTA,
        codigo: p.NUNOTA,
        nome: p.NOME_CLIENTE,
        endereco,
        origemTipo: "pedido",
        nunota: p.NUNOTA,
        numnota: p.NUMNOTA,
        codparc: p.CODPARC,
        codvend: p.CODVEND,
        nomevendedor: p.NOMEVENDEDOR,
        codemp: p.CODEMP,
        logradouro: p.logradouro,
        numero: p.numero,
        bairro: p.bairro,
        cidade: p.cidade,
        uf: p.uf,
        cep: p.cep,
        lat: normalizarLat(p.lat),
        lng: normalizarLng(p.lng)
      };
    });

    idsSelecionados.clear();
    pontosManuais = [];
    limparRota();
    renderClientes(cachePedidosPendentes);
  } catch (e) {
    console.error("[ROTAS] Exception em pedidos pendentes:", e);
    cachePedidosPendentes = [];
  } finally {
    hideRotasLoader();
  }
}

async function carregarClientesNormais() {
  showRotasLoader();
  try {
    listaClientesDiv.innerHTML = "";

    const path = "/logistica/clientes";
    console.log("[ROTAS] GET clientes em", window.APIBASE + path);

    const resp = await apiFetch(path);
    if (!resp.ok) {
      throw new Error("HTTP " + resp.status);
    }
    const data = await resp.json();

    cacheClientes = (data.clientes || []).map(r => {
      const endereco = montarEnderecoPadrao(r);
      return {
        id: r.id,
        codigo: r.codigo,
        nome: r.nomecliente || r.nome,
        endereco,
        origemTipo: "clientes",
        codparc: r.codparc,
        codvend: r.codvend,
        nomevendedor: r.nomevendedor,
        codemp: r.codemp,
        logradouro: r.logradouro,
        numero: r.numero,
        bairro: r.bairro,
        cidade: r.cidade,
        uf: r.uf,
        cep: r.cep,
        lat: normalizarLat(r.lat),
        lng: normalizarLng(r.lng)
      };
    });

    idsSelecionados.clear();
    pontosManuais = [];
    limparRota();
    renderClientes(cacheClientes);
  } catch (e) {
    console.error("[ROTAS] Erro em carregarClientesNormais:", e);
    cacheClientes = [];
  } finally {
    hideRotasLoader();
  }
}

async function carregarVendedores() {
  showRotasLoader();
  try {
    const path = "/vendedores";
    console.log("[ROTAS] GET vendedores em", window.APIBASE + path);
    const resp = await apiFetch(path);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    cacheVendedores = data.vendedores || [];

    selectVendedor.innerHTML =
      '<option value="">Selecione um vendedor...</option>';
    cacheVendedores.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.codvend;
      opt.textContent = `${v.codvend} - ${v.nomevendedor}`;
      selectVendedor.appendChild(opt);
    });
  } catch (e) {
    console.error("[ROTAS] Erro ao carregar vendedores:", e);
    cacheVendedores = [];
  } finally {
    hideRotasLoader();
  }
}

async function carregarCarteiraPorVendedor(codvend) {
  if (!codvend) {
    cacheCarteira = [];
    renderClientes([]);
    return;
  }

  showRotasLoader();
  try {
    listaClientesDiv.innerHTML = "";

    const path = `/carteira?codvend=${encodeURIComponent(codvend)}`;
    console.log("[ROTAS] GET carteira em", window.APIBASE + path);

    const resp = await apiFetch(path);
    if (!resp.ok) throw new Error("HTTP " + resp.status);

    const data = await resp.json();
    cacheCarteira = (data.carteira || []).map(c => {
      const endereco = montarEnderecoPadrao(c);
      return {
        id: c.codparc,
        codigo: c.codparc,
        nome: c.nomecliente,
        endereco,
        origemTipo: "carteira",
        codparc: c.codparc,
        codvend: c.codvend,
        nomevendedor: c.nomevendedor,
        codemp: c.codemp,
        logradouro: c.logradouro,
        numero: c.numero,
        bairro: c.bairro,
        cidade: c.cidade,
        uf: c.uf,
        cep: c.cep,
        lat: normalizarLat(c.lat),
        lng: normalizarLng(c.lng)
      };
    });

    idsSelecionados.clear();
    pontosManuais = [];
    limparRota();
    renderClientes(cacheCarteira);
  } catch (e) {
    console.error("[ROTAS] Erro ao carregar carteira do vendedor:", e);
    cacheCarteira = [];
  } finally {
    hideRotasLoader();
  }
}

// FILTRO LOCAL
function aplicarFiltroLocalClientes() {
  const filtro = filtroNomeInput.value.trim().toLowerCase();
  listaClientesDiv.scrollTop = 0;

  const base = getCacheAtual();
  if (!filtro) {
    renderClientes(base);
    return;
  }

  const filtrados = base.filter(c => {
    const cod = String(c.codigo || "").toLowerCase();
    const nome = String(c.nome || "").toLowerCase();
    const end = String(c.endereco || "").toLowerCase();
    return (
      cod.includes(filtro) || nome.includes(filtro) || end.includes(filtro)
    );
  });
  renderClientes(filtrados);
}

// PONTOS / ROTA
function getClientesSelecionados() {
  const base = getCacheAtual();
  const clientes = [];
  base.forEach(c => {
    if (idsSelecionados.has(c.id)) clientes.push(c);
  });
  return clientes;
}

function reconstruirPainelRota() {
  rotaListaDiv.innerHTML = "";

  const clientesSelecionados = getClientesSelecionados();
  const pontos = [];

  clientesSelecionados.forEach(c => {
    const lat = normalizarLat(c.lat);
    const lng = normalizarLng(c.lng);
    if (lat == null || lng == null) return;
    pontos.push({
      tipo: "cliente",
      id: c.id,
      label: `${c.codigo} - ${c.nome}`,
      endereco: c.endereco,
      lat,
      lng
    });
  });

  pontosManuais.forEach(p => pontos.push(p));

  if (pontos.length > LIMITE_PONTOS_ROTA - 1) {
    alert(
      "Você selecionou muitos pontos (" +
        pontos.length +
        "). Recomenda-se dividir em duas rotas (limite atual ~" +
        (LIMITE_PONTOS_ROTA - 1) +
        " paradas)."
    );
  }

  pontos.forEach((ponto, idx) => {
    const li = document.createElement("li");
    li.className = "rota-item";
    li.setAttribute("draggable", "true");
    li.dataset.tipo = ponto.tipo;
    li.dataset.id = ponto.id;

    const handle = document.createElement("div");
    handle.className = "rota-item-handle";
    handle.innerHTML = "⋮⋮";

    const num = document.createElement("div");
    num.className = "rota-item-num";
    num.textContent = idx + 1;

    const labelWrap = document.createElement("div");
    labelWrap.className = "rota-item-label";

    const main = document.createElement("div");
    main.className = "rota-item-label-main";
    main.textContent =
      ponto.tipo === "cliente" ? ponto.label : `Manual: ${ponto.label}`;

    const sub = document.createElement("div");
    sub.className = "rota-item-label-sub";
    sub.textContent = `${ponto.endereco} (${ponto.lat.toFixed(
      5
    )}, ${ponto.lng.toFixed(5)})`;

    labelWrap.appendChild(main);
    labelWrap.appendChild(sub);

    const remover = document.createElement("button");
    remover.className = "rota-item-remove";
    remover.type = "button";
    remover.innerHTML = "&times;";
    remover.title = "Remover ponto";
    remover.addEventListener("click", e => {
      e.stopPropagation();
      removerPontoDaRota(ponto);
    });

    li.appendChild(handle);
    li.appendChild(num);
    li.appendChild(labelWrap);
    li.appendChild(remover);

    rotaListaDiv.appendChild(li);
  });

  configurarDragAndDropPainelRota();
}

function configurarDragAndDropPainelRota() {
  let draggingEl = null;

  rotaListaDiv.addEventListener("dragstart", e => {
    const item = e.target.closest(".rota-item");
    if (!item) return;
    draggingEl = item;
    item.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.dataset.id);
    }
  });

  rotaListaDiv.addEventListener("dragover", e => {
    e.preventDefault();
    if (!draggingEl) return;
    const afterElement = getDragAfterElement(
      rotaListaDiv,
      e.clientY,
      ".rota-item:not(.dragging)"
    );
    limpaDropzonesRota();

    if (!afterElement) {
      rotaListaDiv.appendChild(draggingEl);
      draggingEl.classList.add("rota-item-dropzone-after");
    } else {
      const box = afterElement.getBoundingClientRect();
      const isBefore = e.clientY < box.top + box.height / 2;
      if (isBefore) {
        rotaListaDiv.insertBefore(draggingEl, afterElement);
        draggingEl.classList.add("rota-item-dropzone-before");
      } else {
        rotaListaDiv.insertBefore(draggingEl, afterElement.nextSibling);
        draggingEl.classList.add("rota-item-dropzone-after");
      }
    }
  });

  rotaListaDiv.addEventListener("drop", e => {
    e.preventDefault();
    if (!draggingEl) return;
    draggingEl.classList.remove("dragging");
    limpaDropzonesRota();
    draggingEl = null;
    renumerarPontosRota();
    gerarRotaAuto();
  });

  rotaListaDiv.addEventListener("dragend", () => {
    if (!draggingEl) return;
    draggingEl.classList.remove("dragging");
    limpaDropzonesRota();
    draggingEl = null;
  });

  function limpaDropzonesRota() {
    rotaListaDiv
      .querySelectorAll(".rota-item-dropzone-before, .rota-item-dropzone-after")
      .forEach(el => {
        el.classList.remove(
          "rota-item-dropzone-before",
          "rota-item-dropzone-after"
        );
      });
  }
}

function getDragAfterElement(container, y, selector) {
  const draggableElements = [...container.querySelectorAll(selector)];

  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      } else {
        return closest;
      }
    },
    { offset: Number.NEGATIVEINFINITY, element: null }
  ).element;
}

function renumerarPontosRota() {
  rotaListaDiv
    .querySelectorAll(".rota-item-num")
    .forEach((el, idx) => (el.textContent = idx + 1));
}

function removerPontoDaRota(ponto) {
  if (ponto.tipo === "manual") {
    pontosManuais = pontosManuais.filter(p => p.id !== ponto.id);
  } else if (ponto.tipo === "cliente") {
    idsSelecionados.delete(ponto.id);
    listaClientesDiv.querySelectorAll(".cliente-item").forEach(div => {
      const cb = div.querySelector(".cliente-checkbox");
      if (!cb) return;
      const id = parseInt(cb.value, 10);
      if (id === ponto.id) {
        cb.checked = false;
        div.classList.remove("selecionado");
      }
    });
  }

  const temSelecionados = idsSelecionados.size > 0 || pontosManuais.length > 0;
  if (!temSelecionados) {
    limparRota();
    rotaListaDiv.innerHTML = "";
    return;
  }
  reconstruirPainelRota();
  gerarRotaAuto();
}

function getPontosNaOrdemPainel() {
  const pontos = [];
  rotaListaDiv.querySelectorAll(".rota-item").forEach(div => {
    const tipo = div.dataset.tipo;
    const id = div.dataset.id;

    if (tipo === "cliente") {
      const base = getCacheAtual();
      const c = base.find(x => String(x.id) === String(id));
      const lat = normalizarLat(c?.lat);
      const lng = normalizarLng(c?.lng);
      if (c && lat != null && lng != null) {
        pontos.push({
          tipo: "cliente",
          id: c.id,
          label: `${c.codigo} - ${c.nome}`,
          endereco: c.endereco,
          lat,
          lng
        });
      }
    } else if (tipo === "manual") {
      const p = pontosManuais.find(x => String(x.id) === String(id));
      if (p) pontos.push({ ...p });
    }
  });
  return pontos;
}

// =======================
// OTIMIZAR ROTA (Vizinho mais próximo)
// =======================

function distanciaEntrePontosKm(a, b) {
  const R = 6371;
  const dLat = (a.lat - b.lat) * Math.PI / 180;
  const dLng = (a.lng - b.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function otimizarOrdemParadasVizinhoMaisProximo() {
  console.log("[ROTAS][ROTA] Otimizando ordem de paradas (vizinho mais próximo)");

  const pontos = getPontosNaOrdemPainel();
  if (!pontos || pontos.length <= 2) {
    alert("Selecione pelo menos 3 pontos para otimizar a rota.");
    return;
  }

  const origem = origemManual || ORIGEM_FIXA;

  const naoVisitados = pontos.map(p => ({ ...p }));
  const ordemOtima = [];

  let atualIndex = 0;
  if (origem && origem.lat != null && origem.lng != null) {
    let melhorDist = Infinity;
    naoVisitados.forEach((p, idx) => {
      const d = distanciaEntrePontosKm(
        { lat: origem.lat, lng: origem.lng },
        { lat: p.lat, lng: p.lng }
      );
      if (d < melhorDist) {
        melhorDist = d;
        atualIndex = idx;
      }
    });
  }

  let atual = naoVisitados.splice(atualIndex, 1)[0];
  ordemOtima.push(atual);

  while (naoVisitados.length) {
    let melhorIdx = 0;
    let melhorDist = Infinity;

    naoVisitados.forEach((p, idx) => {
      const d = distanciaEntrePontosKm(
        { lat: atual.lat, lng: atual.lng },
        { lat: p.lat, lng: p.lng }
      );
      if (d < melhorDist) {
        melhorDist = d;
        melhorIdx = idx;
      }
    });

    atual = naoVisitados.splice(melhorIdx, 1)[0];
    ordemOtima.push(atual);
  }

  console.log("[ROTAS][ROTA] Ordem otimizada:", ordemOtima);

  rotaListaDiv.innerHTML = "";
  ordemOtima.forEach((ponto, idx) => {
    const li = document.createElement("li");
    li.className = "rota-item";
    li.setAttribute("draggable", "true");
    li.dataset.tipo = ponto.tipo;
    li.dataset.id = ponto.id;

    const handle = document.createElement("div");
    handle.className = "rota-item-handle";
    handle.innerHTML = "⋮⋮";

    const num = document.createElement("div");
    num.className = "rota-item-num";
    num.textContent = idx + 1;

    const labelWrap = document.createElement("div");
    labelWrap.className = "rota-item-label";

    const main = document.createElement("div");
    main.className = "rota-item-label-main";
    main.textContent =
      ponto.tipo === "cliente" ? ponto.label : `Manual: ${ponto.label}`;

    const sub = document.createElement("div");
    sub.className = "rota-item-label-sub";
    sub.textContent = `${ponto.endereco} (${ponto.lat.toFixed(
      5
    )}, ${ponto.lng.toFixed(5)})`;

    labelWrap.appendChild(main);
    labelWrap.appendChild(sub);

    const remover = document.createElement("button");
    remover.className = "rota-item-remove";
    remover.type = "button";
    remover.innerHTML = "&times;";
    remover.title = "Remover ponto";
    remover.addEventListener("click", e => {
      e.stopPropagation();
      removerPontoDaRota(ponto);
    });

    li.appendChild(handle);
    li.appendChild(num);
    li.appendChild(labelWrap);
    li.appendChild(remover);

    rotaListaDiv.appendChild(li);
  });

  configurarDragAndDropPainelRota();
  gerarRotaAuto();
}

// ROTA AUTO / OSRM
function limparRota() {
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
  ultimaRotaWaypoints = null;
  ultimaAnaliseRota = null;
  setLinkMapsEnabled(false);
  linkMapsDiv.textContent = "Nenhum link gerado ainda.";
  setAlertasTexto("Nenhuma rota analisada ainda.");
  removerTodosMarkersDoMapa();
}

async function gerarRotaAuto() {
  const selecionados = getClientesSelecionados();
  for (const c of selecionados) {
    c.lat = normalizarLat(c.lat);
    c.lng = normalizarLng(c.lng);
  }

  const destinoStr = getDestinoCampo();
  const pontosPainel = getPontosNaOrdemPainel();

  if (pontosPainel.length === 0) {
    limparRota();
    return;
  }

  const totalParadas = pontosPainel.length;
  const totalWaypointsPotencial = totalParadas + (destinoStr ? 1 : 0) + 1;
  if (totalWaypointsPotencial > LIMITE_PONTOS_ROTA) {
    alert(
      "Rota com muitos pontos (" +
        totalParadas +
        "). Reduza para aproximadamente " +
        (LIMITE_PONTOS_ROTA - 2) +
        " paradas ou divida em duas rotas."
    );
    return;
  }

  showRotasLoader();

  try {
    if (routingControl) {
      map.removeControl(routingControl);
      routingControl = null;
    }
    ultimaRotaWaypoints = null;
    ultimaAnaliseRota = null;
    setLinkMapsEnabled(false);
    linkMapsDiv.textContent = "Nenhum link gerado ainda.";
    setAlertasTexto("Nenhuma rota analisada ainda.");
    removerTodosMarkersDoMapa();

    const waypoints = [];

    if (!origemManual) origemManual = { ...ORIGEM_FIXA };
    const origemLatLng = L.latLng(origemManual.lat, origemManual.lng);
    waypoints.push(origemLatLng);

    if (!marcadorLocalizacao) {
      marcadorLocalizacao = L.marker(origemLatLng, {
        icon: myLocationIcon,
        draggable: true
      })
        .addTo(map)
        .bindPopup("Ponto de partida (arraste para ajustar)");
      marcadorLocalizacao.on("dragend", e => {
        const pos = e.target.getLatLng();
        origemManual.lat = pos.lat;
        origemManual.lng = pos.lng;
        gerarRotaAuto();
      });
    } else {
      marcadorLocalizacao.setLatLng(origemLatLng);
    }

    pontosPainel.forEach(p => {
      const lat = normalizarLat(p.lat);
      const lng = normalizarLng(p.lng);
      if (lat == null || lng == null) return;
      waypoints.push(L.latLng(lat, lng));
    });

    let destinoLatLng = null;
    if (destinoStr) {
      let destLat = null;
      let destLng = null;
      const parsed = parseLatLngText(destinoStr);
      if (parsed) {
        destLat = normalizarLat(parsed.lat);
        destLng = normalizarLng(parsed.lng);
      }
      if (destLat != null && destLng != null) {
        destinoLatLng = L.latLng(destLat, destLng);
      } else {
        const geo = await geocodeTexto(destinoStr);
        if (geo && geo.lat != null && geo.lng != null) {
          destinoLatLng = L.latLng(geo.lat, geo.lng);
        }
      }

      if (destinoLatLng) {
        waypoints.push(destinoLatLng);
      }
    }

    ultimaRotaWaypoints = waypoints;

    routingControl = L.Routing.control({
      waypoints,
      lineOptions: {
        styles: [{ color: "#a855f7", weight: 5, opacity: 0.9 }]
      },
      show: false,
      addWaypoints: false,
      routeWhileDragging: false,
      draggableWaypoints: false
    })
      .on("routesfound", e => {
        const route = e.routes[0];
        ultimaAnaliseRota = route;
        setAlertasTexto(
          `Rota com ${route.waypoints.length} pontos, distância aproximada ${(route.summary.totalDistance / 1000).toFixed(
            1
          )} km, tempo ${(route.summary.totalTime / 3600).toFixed(1)} h.`
        );

        todosMarkersRota = [];
        pontosPainel.forEach((p, idx) => {
          const marker = criarMarkerNumerado(
            p.lat,
            p.lng,
            idx + 1,
            `${p.label}`,
            { tipo: p.tipo, id: p.id }
          );
          marker.addTo(map);
          todosMarkersRota.push(marker);
        });

        setLinkMapsEnabled(true);
      })
      .on("routingerror", err => {
        console.error("[ROTAS] Erro no cálculo de rota:", err);
        setAlertasTexto("Erro ao calcular rota. Verifique os pontos.");
        setLinkMapsEnabled(false);
      })
      .addTo(map);
  } finally {
    hideRotasLoader();
  }
}

// PAINEL ROTA – DRAG/MINIMIZAR
function initPainelRota() {
  const panel = document.getElementById("rota-panel");
  const header = document.getElementById("rota-panel-header");
  const mapContainer = document.getElementById("map-container");
  if (!panel || !header || !mapContainer) return;

  let isDragging = false;
  let startMouseX = 0;
  let startMouseY = 0;
  let startPanelLeft = 0;
  let startPanelTop = 0;

  function onMouseDown(e) {
    if (e.target === rotaPanelMinimize || rotaPanelMinimize.contains(e.target)) {
      return;
    }
    if (e.button !== 0) return;

    const panelRect = panel.getBoundingClientRect();
    const containerRect = mapContainer.getBoundingClientRect();

    startMouseX = e.clientX;
    startMouseY = e.clientY;

    startPanelLeft = panelRect.left - containerRect.left;
    startPanelTop = panelRect.top - containerRect.top;

    isDragging = true;
    panel.classList.add("rota-panel-dragging");
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!isDragging) return;

    const containerRect = mapContainer.getBoundingClientRect();

    const dx = e.clientX - startMouseX;
    const dy = e.clientY - startMouseY;

    let newLeft = startPanelLeft + dx;
    let newTop = startPanelTop + dy;

    const maxLeft = containerRect.width - panel.offsetWidth;
    const maxTop = containerRect.height - panel.offsetHeight;

    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    panel.style.left = newLeft + "px";
    panel.style.top = newTop + "px";
    panel.style.right = "auto";
  }

  function onMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    panel.classList.remove("rota-panel-dragging");
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  header.addEventListener("mousedown", onMouseDown);

  rotaPanelMinimize.addEventListener("click", () => {
    rotaPanel.classList.toggle("rota-panel-minimized");
    if (rotaPanel.classList.contains("rota-panel-minimized")) {
      rotaPanel.style.left = "";
      rotaPanel.style.top = "";
      rotaPanel.style.right = "";
    }
  });
}

// RESIZER DA SIDEBAR INTERNA
function initSidebarResizer() {
  const wrapper = document.getElementById("sidebar-wrapper");
  const resizer = document.getElementById("sidebar-resizer");
  const grid = document.querySelector(".logistica-grid");
  if (!wrapper || !resizer || !grid) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener("mousedown", e => {
    isResizing = true;
    startX = e.clientX;
    startWidth = wrapper.offsetWidth;
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  function onMouseMove(e) {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    const newWidth = Math.max(260, Math.min(520, startWidth + dx));
    grid.style.gridTemplateColumns = `${newWidth}px 6px minmax(0, 1fr)`;
  }

  function onMouseUp() {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }
}

// EVENTOS INICIAIS
function initEventos() {
  tipoOrigemSelect.addEventListener("change", () => {
    origemAtual = tipoOrigemSelect.value;
    idsSelecionados.clear();
    pontosManuais = [];
    limparRota();
    if (origemAtual === "pedidos") {
      grupoVendedoresDiv.style.display = "none";
      carregarPedidosPendentes();
    } else if (origemAtual === "clientes") {
      grupoVendedoresDiv.style.display = "none";
      carregarClientesNormais();
    } else if (origemAtual === "carteira") {
      grupoVendedoresDiv.style.display = "block";
      if (selectVendedor.value) {
        carregarCarteiraPorVendedor(selectVendedor.value);
      } else {
        renderClientes([]);
      }
    }
  });

  selectVendedor.addEventListener("change", () => {
    if (origemAtual === "carteira") {
      carregarCarteiraPorVendedor(selectVendedor.value);
    }
  });

  filtroNomeInput.addEventListener("input", () => {
    aplicarFiltroLocalClientes();
  });

  btnSelecionarTodos.addEventListener("click", () => {
    marcarTodosVisiveis(true);
  });

  btnLimparSelecao.addEventListener("click", () => {
    marcarTodosVisiveis(false);
  });

  btnOtimizarRota.addEventListener("click", () => {
    otimizarOrdemParadasVizinhoMaisProximo();
  });

  chkVerTransito.addEventListener("change", () => {
    toggleTraffic(chkVerTransito.checked);
    if (chkVerTransito.checked) {
      carregarIncidentesTomTom();
    } else {
      incidentMarkers.forEach(m => map.removeLayer(m));
      incidentMarkers = [];
    }
  });

  btnAdicionarPonto.addEventListener("click", async () => {
    const txt = novoPontoInput.value.trim();
    if (!txt) return;

    let latLngParsed = parseLatLngText(txt);
    let novoPonto = null;

    if (latLngParsed) {
      const lat = normalizarLat(latLngParsed.lat);
      const lng = normalizarLng(latLngParsed.lng);
      if (lat != null && lng != null) {
        novoPonto = {
          tipo: "manual",
          id: "manual_" + manualIdSeq++,
          label: txt,
          endereco: txt,
          lat,
          lng
        };
      }
    } else {
      const geo = await geocodeTexto(txt);
      if (geo && geo.lat != null && geo.lng != null) {
        novoPonto = {
          tipo: "manual",
          id: "manual_" + manualIdSeq++,
          label: geo.label,
          endereco: geo.label,
          lat: geo.lat,
          lng: geo.lng
        };
      }
    }

    if (!novoPonto) {
      alert(
        "Não foi possível interpretar esse ponto. Use 'lat,lng' ou um endereço."
      );
      return;
    }

    pontosManuais.push(novoPonto);
    novoPontoInput.value = "";
    reconstruirPainelRota();
    gerarRotaAuto();
  });

  btnGerarRota.addEventListener("click", () => {
    gerarRotaAuto();
  });

  btnGerarLinkMaps.addEventListener("click", () => {
    gerarLinkGoogleMaps();
  });

  btnGerarLinkMapsSidebar.addEventListener("click", () => {
    gerarLinkGoogleMaps();
  });
}

// LINK GOOGLE MAPS
function gerarLinkGoogleMaps() {
  if (!ultimaRotaWaypoints || ultimaRotaWaypoints.length === 0) {
    alert("Nenhuma rota calculada para gerar link.");
    return;
  }
  const pontos = ultimaRotaWaypoints;
  const origem = pontos[0];
  const destino = pontos[pontos.length - 1];
  const intermediarios = pontos.slice(1, -1);

  let url = `https://www.google.com/maps/dir/?api=1`;
  url += `&origin=${origem.lat},${origem.lng}`;
  url += `&destination=${destino.lat},${destino.lng}`;
  if (intermediarios.length) {
    const wps = intermediarios
      .map(p => `${p.lat},${p.lng}`)
      .join("|");
    url += `&waypoints=${encodeURIComponent(wps)}`;
  }
  if (chkEvitarPedagios.checked) {
    url += `&avoid=tolls`;
  }

  linkMapsDiv.textContent = url;
  setLinkMapsEnabled(true);

  try {
    navigator.clipboard.writeText(url);
    const toast = document.getElementById("toast-copiar-link");
    if (toast) {
      toast.style.display = "block";
      requestAnimationFrame(() => {
        toast.classList.add("show");
      });
      setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => {
          toast.style.display = "none";
        }, 200);
      }, 2000);
    }
  } catch (e) {
    console.warn("[ROTAS] Não foi possível copiar automaticamente o link:", e);
  }
}

// INIT
document.addEventListener("DOMContentLoaded", () => {
  initPainelRota();
  initSidebarResizer();
  initEventos();
  configurarInfiniteScrollClientes();
  carregarVendedores();
  carregarPedidosPendentes();
});