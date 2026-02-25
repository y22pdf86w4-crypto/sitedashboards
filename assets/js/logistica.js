// ======== CONFIG API BASE ========


// Só define se ainda não existir
if (window.API_BASE === undefined) {
  const DEFAULT_LOGISTICA_API_BASE =
    'https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1';

  const LOGISTICA_SCRIPT_TAG = document.currentScript;
  const LOGISTICA_API_BASE =
    LOGISTICA_SCRIPT_TAG?.dataset?.apiBase || DEFAULT_LOGISTICA_API_BASE;

  window.API_BASE = LOGISTICA_API_BASE;
}

console.log('logistica.js carregado. API_BASE =', window.API_BASE);

// ======== CONSTANTES DE LIMITE ========

// limite "seguro" de pontos para rota (origem + paradas + destino)
const LIMITE_PONTOS_ROTA = 80;

// ======== TOMTOM TRAFFIC (FLOW) ========

// API key de teste (TomTom) – aqui só para tiles de fluxo
const TOMTOM_API_KEY = 'l22aGTuKjY30e1lAcUqAup3XZ8pYzCOb';

// Camada de fluxo de trânsito da TomTom (overlay sobre o tile base)
const tomtomTrafficLayer = L.tileLayer(
  'https://api.tomtom.com/traffic/map/4/tile/flow/absolute/{z}/{x}/{y}.png?key=' + TOMTOM_API_KEY,
  {
    opacity: 0.7,
    attribution: '&copy; TomTom'
  }
);

function toggleTraffic(ativo) {
  if (ativo) {
    tomtomTrafficLayer.addTo(map);
  } else {
    map.removeLayer(tomtomTrafficLayer);
  }
}

// ======== TOMTOM TRAFFIC INCIDENTS (PONTOS) ========

let incidentMarkers = [];

// ícone simples por categoria
function escolherIconePorCategoria(cat) {
  let color = '#2563eb'; // default azul

  if (cat === 1) color = '#ef4444';        // Accident
  else if (cat === 6) color = '#f97316';   // Jam
  else if (cat === 8) color = '#111827';   // RoadClosed
  else if (cat === 9) color = '#eab308';   // RoadWorks

  return L.divIcon({
    className: 'incident-marker-wrapper',
    html: `<div class="incident-marker" style="
      width:14px;height:14px;border-radius:50%;
      background:${color};border:2px solid #0f172a;
      box-shadow:0 0 6px rgba(15,23,42,0.8);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

// NOVO: traduz descrição da TomTom para texto customizado
function traduzirDescricaoTomTom(desc, props = {}) {
  if (!desc) return 'Incidente de trânsito';

  const d = String(desc).toLowerCase();

  // exemplos de mapeamento simples
  if (d.includes('queuing traffic')) {
    return '🚗🚗 Trânsito em fila (lento)';
  }
  if (d.includes('stationary traffic')) {
    return '⛔ Trânsito parado';
  }

  // você pode usar iconCategory / magnitudeOfDelay / roadNumber etc. de props
  // para montar mensagens mais ricas, ex:
  // const delay = props.delay || props.magnitudeOfDelay;

  // fallback: mantém a descrição original
  return desc;
}

async function carregarIncidentesTomTom() {
  // limpa markers antigos
  incidentMarkers.forEach(m => map.removeLayer(m));
  incidentMarkers = [];

  const bounds = map.getBounds();
  const minLat = bounds.getSouth();
  const minLon = bounds.getWest();
  const maxLat = bounds.getNorth();
  const maxLon = bounds.getEast();

  // Evita erro de área > 10.000km²: só chama com zoom mais próximo
  if (map.getZoom() < 9) {
    console.log('Zoom muito baixo para incidentes, pulando chamada TomTom');
    return;
  }

  const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
  const url = `${window.API_BASE}/logistica/tomtom/incidentes?bbox=${encodeURIComponent(bbox)}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn('Incidentes HTTP', resp.status);
      return;
    }
    const data = await resp.json();

    (data.incidents || []).forEach(inc => {
      const props = inc.properties || {};
      const geom = inc.geometry || {};
      const cat = props.iconCategory;
      const evt = (props.events && props.events[0]) || {};
      const descrOriginal = evt.description || 'Incidente de trânsito';

      // usa texto customizado em vez do texto bruto da TomTom
      const descr = traduzirDescricaoTomTom(descrOriginal, props);

      let lat = null;
      let lon = null;

      if (geom.type === 'Point') {
        const coords = geom.coordinates || [];
        lon = coords[0];
        lat = coords[1];
      } else if (geom.type === 'LineString') {
        const coords = geom.coordinates || [];
        if (coords.length > 0) {
          const mid = Math.floor(coords.length / 2);
          lon = coords[mid][0];
          lat = coords[mid][1];
        }
      }

      if (lat == null || lon == null) return;

      const marker = L.marker([lat, lon], {
        icon: escolherIconePorCategoria(cat)
      }).bindPopup(descr);

      marker.addTo(map);
      incidentMarkers.push(marker);
    });
  } catch (e) {
    console.warn('Erro ao carregar incidentes TomTom:', e);
  }
}

// ======== MAPA (CartoDB Voyager Labels Under) ========

const map = L.map('map', {
  zoomSnap: 0.25,
  zoomDelta: 0.5,
  wheelDebounceTime: 20,
  wheelPxPerZoomLevel: 80,
  attributionControl: false
}).setView([-19.5, -40.3], 7);

const CartoDB_VoyagerLabelsUnder = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png',
  {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
      'contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }
);

CartoDB_VoyagerLabelsUnder.addTo(map);

// Opcional: desabilitar zoom por doubleclick para usar apenas dblclick como "adicionar ponto"
map.doubleClickZoom.disable();

// ======== ESTADO ========

let routingControl = null;
let clienteMarkers = {};
let todosMarkersRota = [];        // markers de rota (clientes + manuais)
let ultimaRotaWaypoints = [];
let cacheClientes = [];
let clientesFiltradosAtuais = [];
let paginaClientes = 0;
const TAMANHO_PAGINA = 30;
let carregandoMais = false;
let ultimaAnaliseRota = null;
let rotaDebounceTimeout = null;
let dragListaConfigurado = false;

let idsSelecionados = new Set();

// marcador da origem (minha localização)
let marcadorLocalizacao = null;

// pontos manuais
let pontosManuais = [];
let manualIdSeq = 1;

// ícone da origem: pin customizado em HTML/CSS
const myLocationIcon = L.divIcon({
  className: '',
  html: '<div class="pin-minha-localizacao"></div>',
  iconSize: [26, 34],
  iconAnchor: [13, 26]
});

// ======== DOM ========

// DOM - sidebar
const listaClientesDiv = document.getElementById('listaClientes');
const contadorClientesSpan = document.getElementById('contadorClientes');
const contadorSelecionadosSpan = document.getElementById('contadorSelecionados');
const resumoSelecionadosDiv = document.getElementById('resumoSelecionados');

const alertasRota = document.getElementById('alertasRota');
const alertasRotaSidebar = document.getElementById('alertasRotaSidebar');

const filtroNomeInput = document.getElementById('filtroNome');

const btnGerarLinkMapsSidebar = document.getElementById('btnGerarLinkMapsSidebar');

const chkEvitarPedagios = document.getElementById('chkEvitarPedagios');
const chkEvitarPontes = document.getElementById('chkEvitarPontes'); // reservado futuro
const linkMapsDiv = document.getElementById('linkMaps');

// checkbox de trânsito (usa chkVerTransito se existir ou chkEvitarPontes como fallback)
let chkVerTransito = document.getElementById('chkVerTransito');
if (!chkVerTransito) {
  chkVerTransito = chkEvitarPontes;
}

// DOM painel rota
const rotaListaDiv = document.getElementById('rotaListaPontos');
const novoPontoInput = document.getElementById('novoPontoInput');
const btnAdicionarPonto = document.getElementById('btnAdicionarPonto');
const rotaPanel = document.getElementById('rota-panel');
const rotaPanelHeader = document.getElementById('rota-panel-header');
const rotaPanelMinimize = document.getElementById('rotaPanelMinimize');

const destinoCampoPainel = document.getElementById('destinoCampoPainel');
const btnGerarRota = document.getElementById('btnGerarRota');
const btnGerarLinkMaps = document.getElementById('btnGerarLinkMaps');

// destino só no painel
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

function dispararAtualizarRota() {
  gerarRotaAuto();
}

// ======== UTILS ========

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

// marcador numerado DRAGGABLE, com referência ao ponto
function criarMarkerNumerado(lat, lng, numero, titulo, pontoRef) {
  const html = `
    <div class="marker-numero">
      <div class="marker-numero-label">${numero}</div>
    </div>
  `;
  const icon = L.divIcon({
    className: 'marker-numero-wrapper',
    html,
    iconSize: [26, 26],
    iconAnchor: [13, 26]
  });

  const marker = L.marker([lat, lng], {
    icon,
    draggable: true
  }).bindPopup(titulo);

  // ao terminar de arrastar, atualiza a posição do ponto e recalcula rota
  marker.on('dragend', e => {
    const { lat: newLat, lng: newLng } = e.target.getLatLng();

    if (pontoRef.tipo === 'cliente') {
      const c = cacheClientes.find(x => x.id === pontoRef.id);
      if (c) {
        c.lat = newLat;
        c.lng = newLng;
      }
    } else if (pontoRef.tipo === 'manual') {
      const p = pontosManuais.find(x => x.id === pontoRef.id);
      if (p) {
        p.lat = newLat;
        p.lng = newLng;
      }
    }

    dispararAtualizacaoRotaDebounce();
  });

  return marker;
}

function getPosicaoAtual() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error('Geolocalização não suportada.'));
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
      },
      err => {
        reject(err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    );
  });
}

// ======== TOAST COPIAR LINK ========

function mostrarToastCopiarLink(mensagem) {
  const toast = document.getElementById('toast-copiar-link');
  if (!toast) return;
  toast.textContent = mensagem || 'Link copiado para a área de transferência.';
  toast.style.display = 'block';
  void toast.offsetWidth;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.style.display = 'none';
    }, 200);
  }, 2000);
}

// ======== GEOCODING ========

async function geocodeEndereco(endereco) {
  if (!endereco) return null;
  const original = String(endereco).trim();
  try {
    const url = `${window.API_BASE}/geocode?q=${encodeURIComponent(original)}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || data.lat == null || data.lng == null) return null;
    return { lat: parseFloat(data.lat), lng: parseFloat(data.lng) };
  } catch {
    return null;
  }
}

// ======== LISTA CLIENTES ========

function atualizarResumoSelecionados() {
  const qtde = idsSelecionados.size;
  if (qtde === 0) resumoSelecionadosDiv.textContent = 'Nenhum cliente selecionado.';
  else if (qtde === 1) resumoSelecionadosDiv.textContent = '1 cliente selecionado.';
  else resumoSelecionadosDiv.textContent = `${qtde} clientes selecionados.`;
}

function atualizarContadorSelecionados() {
  const qtde = idsSelecionados.size;
  contadorSelecionadosSpan.textContent = `${qtde} selecionados`;
  atualizarResumoSelecionados();

  if (qtde === 0 && pontosManuais.length === 0) {
    limparRota();
    rotaListaDiv.innerHTML = '';
    return;
  }

  reconstruirPainelRota();
  dispararAtualizacaoRotaDebounce();
}

function marcarTodosVisiveis(marcar) {
  listaClientesDiv
    .querySelectorAll('.cliente-item .cliente-checkbox')
    .forEach(cb => {
      const id = parseInt(cb.value, 10);
      cb.checked = marcar;
      if (marcar) idsSelecionados.add(id);
      else idsSelecionados.delete(id);
    });
  atualizarContadorSelecionados();
}

function criarItemCliente(c) {
  const div = document.createElement('div');
  div.className = 'cliente-item';
  div.draggable = true;
  div.dataset.id = c.id;

  const checkWrap = document.createElement('label');
  checkWrap.className = 'checkbox-wrapper checkbox-sm checkbox-cliente';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'cliente-checkbox';
  checkbox.value = c.id;

  const checkmark = document.createElement('div');
  checkmark.className = 'checkmark';
  checkmark.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        d="M20 6L9 17L4 12"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      ></path>
    </svg>
  `;

  const spanLabelVis = document.createElement('span');
  spanLabelVis.className = 'label';
  spanLabelVis.textContent = '';

  checkWrap.appendChild(checkbox);
  checkWrap.appendChild(checkmark);
  checkWrap.appendChild(spanLabelVis);

  checkbox.addEventListener('change', () => {
    if (checkbox.checked) idsSelecionados.add(c.id);
    else idsSelecionados.delete(c.id);
    atualizarContadorSelecionados();
  });

  const textos = document.createElement('div');
  textos.className = 'cliente-textos';

  const spanNome = document.createElement('span');
  spanNome.className = 'nome';
  spanNome.textContent = `${c.codigo} - ${c.nome}`;

  const spanBadge = document.createElement('span');
  spanBadge.className = 'badge';
  spanBadge.textContent = c.endereco || '';

  const spanAlerta = document.createElement('span');
  spanAlerta.className = 'badge alerta';
  spanAlerta.style.display = 'none';
  spanAlerta.textContent = '⚠ endereço não localizado';

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

  listaClientesDiv.addEventListener('dragover', e => {
    e.preventDefault();
    const dragging = listaClientesDiv.querySelector('.cliente-item.dragging');
    if (!dragging) return;
    const afterElement = getDragAfterElement(
      listaClientesDiv,
      e.clientY,
      '.cliente-item:not(.dragging)'
    );
    if (afterElement == null) listaClientesDiv.appendChild(dragging);
    else listaClientesDiv.insertBefore(dragging, afterElement);
  });

  listaClientesDiv.addEventListener('dragstart', e => {
    const item = e.target.closest('.cliente-item');
    if (!item) return;
    item.classList.add('dragging');
  });

  listaClientesDiv.addEventListener('dragend', e => {
    const item = e.target.closest('.cliente-item');
    if (!item) return;
    item.classList.remove('dragging');
  });
}

function limparListaClientesVisual() {
  listaClientesDiv.innerHTML = '';
  contadorSelecionadosSpan.textContent = `${idsSelecionados.size} selecionados`;
  atualizarResumoSelecionados();
}

function renderClientesPagina() {
  if (!clientesFiltradosAtuais || clientesFiltradosAtuais.length === 0) {
    limparListaClientesVisual();
    contadorClientesSpan.textContent = '0 clientes';
    return;
  }

  const inicio = paginaClientes * TAMANHO_PAGINA;
  if (inicio >= clientesFiltradosAtuais.length) return;

  const fim = Math.min(inicio + TAMANHO_PAGINA, clientesFiltradosAtuais.length);

  const frag = document.createDocumentFragment();
  for (let i = inicio; i < fim; i++) {
    const c = clientesFiltradosAtuais[i];
    const div = criarItemCliente(c);

    if (idsSelecionados.has(c.id)) {
      const cb = div.querySelector('.cliente-checkbox');
      if (cb) cb.checked = true;
      div.classList.add('selecionado');
    }

    frag.appendChild(div);
  }
  listaClientesDiv.appendChild(frag);

  paginaClientes++;
  contadorClientesSpan.textContent = `${clientesFiltradosAtuais.length} clientes`;
}

function renderClientes(clientes) {
  clientesFiltradosAtuais = clientes || [];
  paginaClientes = 0;
  limparListaClientesVisual();
  renderClientesPagina();
  configurarDragAndDropLista();
}

// ======== INFINITE SCROLL CLIENTES ========

function configurarInfiniteScrollClientes() {
  listaClientesDiv.addEventListener('scroll', () => {
    if (carregandoMais) return;
    const scrollBottom = listaClientesDiv.scrollTop + listaClientesDiv.clientHeight;
    const limite = listaClientesDiv.scrollHeight - 40;

    if (scrollBottom >= limite) {
      const inicio = paginaClientes * TAMANHO_PAGINA;
      if (inicio >= clientesFiltradosAtuais.length) return;

      carregandoMais = true;
      setTimeout(() => {
        renderClientesPagina();
        carregandoMais = false;
      }, 0);
    }
  });
}

// ======== CARGA INICIAL ========

async function carregarClientesDoServidor() {
  try {
    listaClientesDiv.classList.add('loading');
    listaClientesDiv.innerHTML = '';
    console.log('GET clientes em:', `${window.API_BASE}/logistica/clientes`);
    const resp = await fetch(`${window.API_BASE}/logistica/clientes`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    cacheClientes = data.clientes || [];
    renderClientes(cacheClientes);
  } catch (e) {
    console.error(e);
    alert('Erro ao carregar clientes. Veja console.');
  } finally {
    listaClientesDiv.classList.remove('loading');
  }
}

// ======== FILTRO LOCAL ========

function aplicarFiltroLocal() {
  const filtro = filtroNomeInput.value.trim().toLowerCase();
  listaClientesDiv.scrollTop = 0;

  if (!filtro) {
    renderClientes(cacheClientes);
    return;
  }

  const filtrados = cacheClientes.filter(c => {
    const cod = String(c.codigo || '').toLowerCase();
    const nome = String(c.nome || '').toLowerCase();
    const end = String(c.endereco || '').toLowerCase();
    return cod.includes(filtro) || nome.includes(filtro) || end.includes(filtro);
  });

  renderClientes(filtrados);
}

// ======== PONTOS / PAINEL ========

function parseLatLngText(txt) {
  if (!txt) return null;
  const parts = txt.split(',');
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

function getClientesSelecionados() {
  const clientes = [];
  cacheClientes.forEach(c => {
    if (idsSelecionados.has(c.id)) clientes.push(c);
  });
  return clientes;
}

function reconstruirPainelRota() {
  rotaListaDiv.innerHTML = '';

  const clientesSelecionados = getClientesSelecionados();
  const pontos = [];

  clientesSelecionados.forEach(c => {
    if (c.lat == null || c.lng == null) return;
    pontos.push({
      tipo: 'cliente',
      id: c.id,
      label: `${c.codigo} - ${c.nome}`,
      endereco: c.endereco,
      lat: c.lat,
      lng: c.lng
    });
  });

  pontosManuais.forEach(p => pontos.push(p));

  if (pontos.length > LIMITE_PONTOS_ROTA - 1) {
    alert(
      `Você selecionou muitos pontos (${pontos.length}). ` +
        `Recomenda-se dividir em duas rotas (limite atual ~${LIMITE_PONTOS_ROTA - 1} paradas).`
    );
  }

  pontos.forEach((ponto, idx) => {
    const li = document.createElement('li');
    li.className = 'rota-item';
    li.setAttribute('draggable', 'true');
    li.dataset.tipo = ponto.tipo;
    li.dataset.id = ponto.id;

    const handle = document.createElement('div');
    handle.className = 'rota-item-handle';
    handle.innerHTML = '⋮⋮';

    const num = document.createElement('div');
    num.className = 'rota-item-num';
    num.textContent = idx + 1;

    const labelWrap = document.createElement('div');
    labelWrap.className = 'rota-item-label';

    const main = document.createElement('div');
    main.className = 'rota-item-label-main';
    main.textContent =
      ponto.tipo === 'cliente'
        ? ponto.label
        : `[Manual] ${ponto.label}`;

    const sub = document.createElement('div');
    sub.className = 'rota-item-label-sub';
    sub.textContent = ponto.endereco || `${ponto.lat.toFixed(5)}, ${ponto.lng.toFixed(5)}`;

    labelWrap.appendChild(main);
    labelWrap.appendChild(sub);

    const remover = document.createElement('button');
    remover.className = 'rota-item-remove';
    remover.type = 'button';
    remover.textContent = '×';
    remover.title = 'Remover ponto';
    remover.addEventListener('click', e => {
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

  rotaListaDiv.addEventListener('dragstart', e => {
    const item = e.target.closest('.rota-item');
    if (!item) return;
    draggingEl = item;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.dataset.id || '');
  });

  rotaListaDiv.addEventListener('dragover', e => {
    e.preventDefault();
    if (!draggingEl) return;

    const afterElement = getDragAfterElement(
      rotaListaDiv,
      e.clientY,
      '.rota-item:not(.dragging)'
    );
    limpaDropzonesRota();

    if (!afterElement) {
      rotaListaDiv.appendChild(draggingEl);
      draggingEl.classList.add('rota-item-dropzone-after');
    } else {
      const box = afterElement.getBoundingClientRect();
      const isBefore = e.clientY < box.top + box.height / 2;
      if (isBefore) {
        rotaListaDiv.insertBefore(draggingEl, afterElement);
        draggingEl.classList.add('rota-item-dropzone-before');
      } else {
        rotaListaDiv.insertBefore(draggingEl, afterElement.nextSibling);
        draggingEl.classList.add('rota-item-dropzone-after');
      }
    }
  });

  rotaListaDiv.addEventListener('drop', e => {
    e.preventDefault();
    if (!draggingEl) return;
    draggingEl.classList.remove('dragging');
    limpaDropzonesRota();
    draggingEl = null;

    renumerarPontosRota();
    dispararAtualizacaoRotaDebounce();
  });

  rotaListaDiv.addEventListener('dragend', () => {
    if (!draggingEl) return;
    draggingEl.classList.remove('dragging');
    limpaDropzonesRota();
    draggingEl = null;
  });
}

function limpaDropzonesRota() {
  rotaListaDiv
    .querySelectorAll('.rota-item-dropzone-before, .rota-item-dropzone-after')
    .forEach(el => {
      el.classList.remove('rota-item-dropzone-before', 'rota-item-dropzone-after');
    });
}

function getDragAfterElement(container, y, selector) {
  const draggableElements = [...container.querySelectorAll(selector)];

  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    },
    { offset: Number.NEGATIVE_INFINITY }
  ).element;
}

function renumerarPontosRota() {
  rotaListaDiv.querySelectorAll('.rota-item-num').forEach((el, idx) => {
    el.textContent = idx + 1;
  });
}

function removerPontoDaRota(ponto) {
  if (ponto.tipo === 'manual') {
    pontosManuais = pontosManuais.filter(p => p.id !== ponto.id);
  } else if (ponto.tipo === 'cliente') {
    idsSelecionados.delete(ponto.id);
    listaClientesDiv.querySelectorAll('.cliente-item').forEach(div => {
      const cb = div.querySelector('.cliente-checkbox');
      if (!cb) return;
      const id = parseInt(cb.value, 10);
      if (id === ponto.id) cb.checked = false;
    });
  }

  atualizarContadorSelecionados();

  const temSelecionados = idsSelecionados.size > 0;
  if (!temSelecionados && pontosManuais.length === 0) {
    limparRota();
    rotaListaDiv.innerHTML = '';
    return;
  }

  dispararAtualizacaoRotaDebounce();
}

function getPontosNaOrdemPainel() {
  const pontos = [];

  rotaListaDiv.querySelectorAll('.rota-item').forEach(div => {
    const tipo = div.dataset.tipo;
    const id = div.dataset.id;
    if (tipo === 'cliente') {
      const c = cacheClientes.find(x => String(x.id) === String(id));
      if (c && c.lat != null && c.lng != null) {
        pontos.push({
          tipo: 'cliente',
          id: c.id,
          label: `${c.codigo} - ${c.nome}`,
          endereco: c.endereco,
          lat: c.lat,
          lng: c.lng
        });
      }
    } else if (tipo === 'manual') {
      const p = pontosManuais.find(x => String(x.id) === String(id));
      if (p) pontos.push(p);
    }
  });

  return pontos;
}

// ======== ROTA AUTO ========

function limparRota() {
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
  ultimaRotaWaypoints = [];
  ultimaAnaliseRota = null;
  setLinkMapsEnabled(false);
  linkMapsDiv.textContent = 'Nenhum link gerado ainda.';
  setAlertasTexto('Nenhuma rota analisada ainda.');
  removerTodosMarkersDoMapa();
}

async function gerarRotaAuto() {
  const selecionados = getClientesSelecionados();
  for (const c of selecionados) {
    if (c.lat == null || c.lng == null) {
      const geo = await geocodeEndereco(c.endereco);
      if (geo) {
        c.lat = geo.lat;
        c.lng = geo.lng;
      }
    }
  }

  const destinoStr = getDestinoCampo();
  const pontosPainel = getPontosNaOrdemPainel();
  if (pontosPainel.length === 0) {
    limparRota();
    return;
  }

  const totalParadas = pontosPainel.length;
  const totalWaypointsPotencial = totalParadas + 1 + (destinoStr ? 1 : 0);
  if (totalWaypointsPotencial > LIMITE_PONTOS_ROTA) {
    alert(
      `Rota com muitos pontos (${totalParadas}). ` +
        `Reduza para aproximadamente ${LIMITE_PONTOS_ROTA - 2} paradas ou divida em duas rotas.`
    );
    return;
  }

  limparRota();

  const waypoints = [];

  try {
    const origemAtual = await getPosicaoAtual();
    if (origemAtual) {
      const origemLatLng = L.latLng(origemAtual.lat, origemAtual.lng);
      waypoints.push(origemLatLng);

      if (!marcadorLocalizacao) {
        marcadorLocalizacao = L.marker(origemLatLng, { icon: myLocationIcon })
          .addTo(map)
          .bindPopup('Minha localização de partida');
      } else {
        marcadorLocalizacao.setLatLng(origemLatLng);
      }
    }
  } catch (e) {
    console.warn('Não foi possível obter localização atual:', e);
  }

  pontosPainel.forEach(p => {
    waypoints.push(L.latLng(p.lat, p.lng));
  });

  if (destinoStr) {
    const parsed = parseLatLngText(destinoStr);
    if (!parsed) {
      alert('Destino inválido. Use "lat,lng".');
      return;
    }
    waypoints.push(L.latLng(parsed.lat, parsed.lng));
  }

  if (waypoints.length < 2) {
    limparRota();
    return;
  }

  ultimaRotaWaypoints = waypoints;

  removerTodosMarkersDoMapa();
  pontosPainel.forEach((ponto, idx) => {
    const numero = idx + 1;
    const marker = criarMarkerNumerado(
      ponto.lat,
      ponto.lng,
      numero,
      `${numero}. ${ponto.label}`,
      ponto
    );
    marker.addTo(map);
    todosMarkersRota.push(marker);
    if (ponto.tipo === 'cliente') clienteMarkers[ponto.id] = marker;
  });

  routingControl = L.Routing.control({
    waypoints: waypoints,
    lineOptions: {
      styles: [
        { color: '#581c87', opacity: 0.8, weight: 9 },  // roxo escuro
        { color: '#a855f7', opacity: 1, weight: 5 }     // roxo neon
      ]
    },
    router: L.Routing.osrmv1({
      serviceUrl: 'https://router.project-osrm.org/route/v1'
    }),
    showAlternatives: false,
    // markers do L.Routing desativados; usamos nossos markers numerados
    addWaypoints: false,
    draggableWaypoints: false,
    routeWhileDragging: false,
    createMarker: function () {
      return null;
    },
    show: false
  }).addTo(map);

  Array.from(document.getElementsByClassName('leaflet-routing-container')).forEach(
    el => (el.style.display = 'none')
  );

  routingControl.on('routesfound', function (e) {
    if (!e.routes || !e.routes.length) return;
    const route = e.routes[0];
    const distKm = (route.summary.totalDistance / 1000).toFixed(1);
    const durMin = Math.round(route.summary.totalTime / 60);

    const texto = `${distKm} km • ~${durMin} min`;
    setAlertasTexto(`Resumo da rota: ${texto}`);
  });

  setLinkMapsEnabled(true);
}

// debounce
function dispararAtualizacaoRotaDebounce() {
  if (rotaDebounceTimeout) clearTimeout(rotaDebounceTimeout);
  rotaDebounceTimeout = setTimeout(() => {
    gerarRotaAuto();
  }, 700);
}

// ======== PONTO MANUAL ========

async function adicionarPontoManual() {
  const texto = novoPontoInput.value.trim();
  if (!texto) return;

  const latlng = parseLatLngText(texto);
  let lat = null;
  let lng = null;
  let label = texto;

  if (latlng) {
    lat = latlng.lat;
    lng = latlng.lng;
  } else {
    const geo = await geocodeEndereco(texto);
    if (!geo) {
      alert('Não foi possível localizar este endereço.');
      return;
    }
    lat = geo.lat;
    lng = geo.lng;
  }

  const novo = {
    id: 'manual-' + manualIdSeq++,
    tipo: 'manual',
    label,
    lat,
    lng
  };
  pontosManuais.push(novo);
  novoPontoInput.value = '';

  // refletir no painel
  reconstruirPainelRota();
  // atualizar rota
  dispararAtualizacaoRotaDebounce();
}

// ======== CLICK / DOUBLE CLICK NO MAPA ========

// duplo clique no mapa adiciona ponto manual
map.on('dblclick', e => {
  const { lat, lng } = e.latlng;

  const novo = {
    id: 'manual-' + manualIdSeq++,
    tipo: 'manual',
    label: `Ponto manual ${manualIdSeq - 1}`,
    lat,
    lng
  };

  pontosManuais.push(novo);
  reconstruirPainelRota();
  dispararAtualizacaoRotaDebounce();
});

// ======== LINK GOOGLE MAPS ========

async function gerarLinkGoogleMaps() {
  if (!ultimaRotaWaypoints || ultimaRotaWaypoints.length < 2) {
    alert('Gere uma rota antes.');
    return;
  }

  const origin = ultimaRotaWaypoints[0];
  const destination = ultimaRotaWaypoints[ultimaRotaWaypoints.length - 1];
  const intermediarios = ultimaRotaWaypoints.slice(
    1,
    ultimaRotaWaypoints.length - 1
  );

  const baseUrl = 'https://www.google.com/maps/dir/?api=1';
  const originParam = `origin=${encodeURIComponent(origin.lat + ',' + origin.lng)}`;
  const destParam = `destination=${encodeURIComponent(
    destination.lat + ',' + destination.lng
  )}`;

  let waypointsParam = '';
  if (intermediarios.length > 0) {
    const wps = intermediarios.map(wp => wp.lat + ',' + wp.lng).join('|');
    waypointsParam = `&waypoints=${encodeURIComponent(wps)}`;
  }

  const travelMode = '&travelmode=driving';

  const evitarPedagios = chkEvitarPedagios.checked;
  const avoidParams = [];
  if (evitarPedagios) avoidParams.push('tolls');
  const avoidStr =
    avoidParams.length > 0 ? `&avoid=${avoidParams.join('%7C')}` : '';

  const finalUrl = `${baseUrl}&${originParam}&${destParam}${waypointsParam}${travelMode}${avoidStr}`;

  linkMapsDiv.textContent = finalUrl;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(finalUrl);
    } else {
      const ta = document.createElement('textarea');
      ta.value = finalUrl;
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    mostrarToastCopiarLink('Link gerado e copiado para a área de transferência.');
  } catch (err) {
    console.error('Erro ao copiar link:', err);
    mostrarToastCopiarLink('Link gerado, mas não foi possível copiar automaticamente.');
  }
}

// ======== PAINEL ARRASTÁVEL / MINIMIZAR ========

(function configurarDragPainelRota() {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startTop = 0;
  let startRight = 0;
  let frameRequested = false;
  let targetTop = 0;
  let targetRight = 0;

  const container = document.getElementById('map-container');

  function applyPosition() {
    rotaPanel.style.top = targetTop + 'px';
    rotaPanel.style.right = targetRight + 'px';
    frameRequested = false;
  }

  rotaPanelHeader.addEventListener('mousedown', e => {
    dragging = true;
    const rect = rotaPanel.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    startX = e.clientX;
    startY = e.clientY;
    startTop = rect.top - containerRect.top;
    startRight = containerRect.right - rect.right;

    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const containerRect = container.getBoundingClientRect();
    const painelLargura = rotaPanel.offsetWidth || 260;

    let newTop = startTop + dy;
    let newRight = startRight - dx;

    const minTop = 8;
    const maxTop = containerRect.height - 80;
    if (newTop < minTop) newTop = minTop;
    if (newTop > maxTop) newTop = maxTop;

    const minRight = 8;
    const maxRight = containerRect.width - painelLargura - 8;
    if (newRight < minRight) newRight = minRight;
    if (newRight > maxRight) newRight = maxRight;

    targetTop = newTop;
    targetRight = newRight;

    if (!frameRequested) {
      frameRequested = true;
      window.requestAnimationFrame(applyPosition);
    }
  });

  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      document.body.style.userSelect = '';
    }
  });
})();

rotaPanelMinimize.addEventListener('click', () => {
  const body = rotaPanel.querySelector('.rota-body');
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'flex' : 'none';
  rotaPanelMinimize.textContent = isHidden ? '−' : '+';
});

// ======== EVENTOS / INIT ========

configurarInfiniteScrollClientes();
filtroNomeInput.addEventListener('input', aplicarFiltroLocal);

document
  .getElementById('btnSelecionarTodos')
  .addEventListener('click', () => marcarTodosVisiveis(true));

document
  .getElementById('btnLimparSelecao')
  .addEventListener('click', () => marcarTodosVisiveis(false));

btnGerarRota.addEventListener('click', dispararAtualizarRota);

btnGerarLinkMaps.addEventListener('click', gerarLinkGoogleMaps);
btnGerarLinkMapsSidebar.addEventListener('click', gerarLinkGoogleMaps);

btnAdicionarPonto.addEventListener('click', adicionarPontoManual);
novoPontoInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    adicionarPontoManual();
  }
});

// toggle de trânsito TomTom
if (chkVerTransito) {
  chkVerTransito.addEventListener('change', () => {
    toggleTraffic(chkVerTransito.checked);
  });
}

carregarClientesDoServidor();

// atualiza incidentes sempre que o mapa parar de mexer
map.on('moveend', () => {
  carregarIncidentesTomTom();
});

window.addEventListener('load', () => {
  setTimeout(() => {
    map.invalidateSize();
    carregarIncidentesTomTom();
  }, 200);
});
