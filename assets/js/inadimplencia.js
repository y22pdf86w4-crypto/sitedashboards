// assets/js/inadimplencia.js

console.log("[INAD] Script inadimplencia.js carregado.");

// Base da API: usa window.APIBASE (core global); se não existir, cai no default.
function getApiBaseInad() {
  if (typeof window !== "undefined" && window.APIBASE) {
    return window.APIBASE;
  }
  return "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
}

let leafletMap = null;
let heatLayer = null;
let debugMarkerLayer = null;
let ultimoDashboardData = null;

const pontoIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34]
});

/* ================================
   CSS do mapa (inline)
================================ */
(function ensureMapCss() {
  const style = document.createElement("style");
  style.innerHTML = `
    #leafletMap {
      width: 100% !important;
      height: 100% !important;
      min-height: 260px !important;
      position: relative;
    }
    .leaflet-container {
      z-index: 10 !important;
    }
    .leaflet-map-pane canvas {
      z-index: 999 !important;
      position: relative;
    }
  `;
  document.head.appendChild(style);
})();

/* ================================
   HELPERS GERAIS
================================ */

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

// Garante usuário logado
function getUsuarioObrigatorioInad() {
  const user =
    typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  console.log("[INAD][getUsuarioObrigatorio] user:", user && {
    email: user.email,
    nome: user.nome,
    tipo: user.tipo,
    perfis: user.perfis
  });

  if (!user) {
    console.warn("[INAD][getUsuarioObrigatorio] Sem usuário, redirecionando.");
    window.location.href = "../index.html";
    return null;
  }
  if (!user.email) {
    console.warn(
      "[INAD][getUsuarioObrigatorio] Usuário sem email, redirecionando."
    );
    window.location.href = "../index.html";
    return null;
  }
  return user;
}

// Headers com token + e-mail, reaproveitando helper global se existir
function getAuthHeadersInad() {
  const user = getUsuarioObrigatorioInad();
  if (!user) {
    console.warn(
      "[INAD][getAuthHeadersInad] Sem usuário, retornando headers mínimos."
    );
    return { "Content-Type": "application/json" };
  }

  let headers;

  if (typeof getAuthHeadersCalendario === "function") {
    // Usa exatamente o mesmo helper do calendário
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
          "[INAD][getAuthHeadersInad] authToken ausente no sessionStorage."
        );
      }
    } catch (e) {
      console.warn(
        "[INAD][getAuthHeadersInad] Erro ao ler authToken:",
        e
      );
    }
  }

  headers["x-usuario-email"] = user.email;

  const safe = { ...headers };
  if (safe.Authorization) safe.Authorization = "Bearer ****";
  console.log("[INAD][getAuthHeadersInad] Headers finais:", safe);

  return headers;
}

// GET genérico para inadimplência/vendas
async function apiGetInad(path) {
  const base = getApiBaseInad();
  if (!base) {
    console.error("[INAD][apiGetInad] API base não definida.");
    throw new Error("API base não configurada");
  }

  const url = base + path;
  console.log("[INAD][apiGetInad] URL:", url);

  const headers = getAuthHeadersInad();
  const safe = { ...headers };
  if (safe.Authorization) safe.Authorization = "Bearer ****";
  console.log("[INAD][apiGetInad] Headers enviados:", safe);

  let resp;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers
    });
  } catch (e) {
    console.error("[INAD][apiGetInad] Erro de rede/fetch:", e);
    throw new Error("Falha na comunicação com o servidor (inadimplência)");
  }

  console.log("[INAD][apiGetInad] HTTP status:", resp.status);

  if (!resp.ok) {
    let body = "";
    try {
      body = await resp.text();
    } catch (e) {
      console.warn("[INAD][apiGetInad] Erro ao ler corpo:", e);
    }
    console.error(
      "[INAD][apiGetInad] Resposta não OK:",
      "status=", resp.status,
      "body=", body
    );
    if (resp.status === 401) {
      console.warn(
        "[INAD][apiGetInad] 401 - não autorizado (token/e-mail ausente ou inválido)."
      );
    }
    throw new Error("HTTP " + resp.status + " ao chamar " + path);
  }

  try {
    const json = await resp.json();
    console.log("[INAD][apiGetInad] JSON recebido:", json);
    return json;
  } catch (e) {
    console.error("[INAD][apiGetInad] Erro ao fazer parse JSON:", e);
    throw new Error("Erro ao interpretar resposta JSON");
  }
}

/* ================================
   DOMContentLoaded
================================ */

window.addEventListener("DOMContentLoaded", () => {
  console.log("[INAD] DOMContentLoaded");

  const user = getUsuarioObrigatorioInad();
  if (!user) return;

  if (typeof gerarParticulasSelector === "function") {
    const particlesContainer = document.querySelector(".particles-container");
    if (particlesContainer && particlesContainer.children.length === 0) {
      gerarParticulasSelector(".particles-container", 22);
    }
  }

  const fAno = document.getElementById("fAno");
  if (fAno && !fAno.value) {
    const anoAtual = new Date().getFullYear();
    fAno.value = anoAtual < 2020 ? 2020 : anoAtual;
  }

  const app = document.getElementById("app");
  const btnToggle = document.getElementById("btnToggleSidebar");
  if (app && btnToggle) {
    btnToggle.addEventListener("click", () => {
      app.classList.toggle("sidebar-collapsed");
      if (leafletMap) {
        setTimeout(() => leafletMap.invalidateSize(), 200);
      }
    });
  }

  const btnAplicar = document.getElementById("btnAplicar");
  const btnLimpar = document.getElementById("btnLimpar");

  if (btnAplicar) {
    btnAplicar.addEventListener("click", () => {
      console.log("[FILTRO] Botão Aplicar clicado");
      if (!anoValidoOuVazio()) return;
      atualizarTudo();
    });
  }

  if (btnLimpar) {
    btnLimpar.addEventListener("click", () => {
      console.log("[FILTRO] Botão Limpar clicado");
      limparFiltros();
      atualizarTudo();
    });
  }

  const inputsAuto = [
    "fAno",
    "fMes",
    "fRegiao",
    "fVendedor",
    "fVendedorNome",
    "fCliente"
  ];
  const debouncedAtualizar = debounce(() => {
    if (!anoValidoOuVazio()) {
      console.log("[FILTRO] Ano inválido, não atualiza");
      return;
    }
    atualizarTudo();
  }, 400);

  inputsAuto.forEach(id => {
    const el = document.getElementById(id);
    if (!el) {
      console.warn(`[INIT] Campo de filtro ${id} não encontrado`);
      return;
    }
    const evt = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evt, () => {
      console.log("[FILTRO] Campo alterado:", id, "valor:", el.value);
      debouncedAtualizar();
    });
  });

  const fClienteNome = document.getElementById("fClienteNome");
  if (fClienteNome) {
    fClienteNome.addEventListener(
      "input",
      debounce(() => {
        console.log("[FILTRO] Cliente (nome) input:", fClienteNome.value);
        buscarClientePorNome();
      }, 300)
    );
  }

  const cardClientesInadWrapper = document.getElementById(
    "cardClientesInadWrapper"
  );
  if (cardClientesInadWrapper) {
    cardClientesInadWrapper.addEventListener("click", () => {
      if (!ultimoDashboardData) return;
      abrirModalClientes({
        origem: "card",
        titulo: "Clientes inadimplentes",
        clientes: ultimoDashboardData.clientes || []
      });
    });
  }

  inicializarModalClientes();

  atualizarTudo();
});

/* ========= TOAST DE ANO ========= */

function mostrarToastAno(msg) {
  const toast = document.getElementById("toastAno");
  const span = document.getElementById("toastAnoMsg");
  if (!toast || !span) return;
  span.textContent = msg;
  toast.classList.add("toast-ano-visible");
  toast.setAttribute("aria-hidden", "false");
  setTimeout(() => {
    toast.classList.remove("toast-ano-visible");
    toast.setAttribute("aria-hidden", "true");
  }, 3500);
}

/* ========= VALIDAÇÃO DE ANO ========= */

function anoValidoOuVazio() {
  const fAno = document.getElementById("fAno");
  if (!fAno) return true;
  const str = (fAno.value || "").trim();
  if (!str) return true;
  if (str.length !== 4) {
    mostrarToastAno("Informe o ano com 4 dígitos (ex: 2024).");
    return false;
  }
  const n = Number(str);
  if (Number.isNaN(n)) {
    mostrarToastAno("Ano inválido.");
    return false;
  }
  if (n < 2020) {
    mostrarToastAno("Só é permitido filtrar a partir do ano de 2020.");
    fAno.value = "2020";
    return false;
  }
  if (n > 2100) {
    mostrarToastAno("Ano fora do intervalo permitido.");
    return false;
  }
  return true;
}

function limparFiltros() {
  console.log("[FILTRO] limparFiltros executado");

  const anoAtual = new Date().getFullYear();
  const fAno = document.getElementById("fAno");
  if (fAno) fAno.value = anoAtual < 2020 ? 2020 : anoAtual;

  const fMes = document.getElementById("fMes");
  if (fMes) fMes.value = "";

  const fRegiao = document.getElementById("fRegiao");
  if (fRegiao) fRegiao.value = "";
  const fVendedor = document.getElementById("fVendedor");
  if (fVendedor) fVendedor.value = "";
  const fVendedorNome = document.getElementById("fVendedorNome");
  if (fVendedorNome) fVendedorNome.value = "";
  const fCliente = document.getElementById("fCliente");
  if (fCliente) fCliente.value = "";

  const fClienteNome = document.getElementById("fClienteNome");
  if (fClienteNome) fClienteNome.value = "";

  const resCliente = document.getElementById("clienteBuscaResultados");
  if (resCliente) resCliente.innerHTML = "";
}

/* ========= FILTROS / QUERYSTRING ========= */

function getFiltrosQueryString(extra = {}) {
  const anoStr = (document.getElementById("fAno")?.value || "").trim();
  const mesStr = (document.getElementById("fMes")?.value || "").trim();
  const regiao = document.getElementById("fRegiao")?.value || "";
  const vendedor = document.getElementById("fVendedor")?.value || "";
  const vendedorNome =
    document.getElementById("fVendedorNome")?.value || "";
  const cliente = document.getElementById("fCliente")?.value || "";

  const params = new URLSearchParams();

  const anoNum = Number(anoStr);
  const anoOk =
    anoStr.length === 4 &&
    !Number.isNaN(anoNum) &&
    anoNum >= 2020 &&
    anoNum <= 2100;

  if (anoOk) {
    if (mesStr) {
      const dataIni = `${anoStr}-${mesStr}-01`;
      const dataFim = `${anoStr}-${mesStr}-31`;
      params.append("dataIni", dataIni);
      params.append("dataFim", dataFim);
    } else {
      const dataIni = `${anoStr}-01-01`;
      const dataFim = `${anoStr}-12-31`;
      params.append("dataIni", dataIni);
      params.append("dataFim", dataFim);
    }
  }

  if (regiao) params.append("regiao", regiao);
  if (vendedor) params.append("vendedor", vendedor);
  if (vendedorNome) params.append("vendedorNome", vendedorNome);
  if (cliente) params.append("cliente", cliente);

  Object.entries(extra).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      params.append(k, v);
    }
  });

  const qs = params.toString();
  console.log("[FILTRO] QueryString gerada:", qs);
  return qs ? "?" + qs : "";
}

/* ========= FORMATADORES ========= */

function fmtValor(v) {
  if (v == null) return "–";
  return Number(v).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function fmtInt(v) {
  if (v == null) return "–";
  return Number(v).toLocaleString("pt-BR");
}

function fmtPerc(v) {
  if (v == null) return "–";
  return (Number(v) * 100).toFixed(1).replace(".", ",") + "%";
}

function truncarNomeVendedor(nome, max = 12) {
  if (!nome) return "—";
  nome = String(nome).trim();
  return nome.length > max ? nome.slice(0, max) + "…" : nome;
}

/* ========= DASHBOARD ========= */

async function carregarDashboard() {
  const qs = getFiltrosQueryString();
  const pathInad = `/inadimplencia/dashboard${qs}`;
  const pathVend = `/vendas/dashboard${qs}`;

  console.log("[DASHBOARD] Paths:", pathInad, pathVend);

  const cardReceita = document.getElementById("cardReceitaTotal");
  const cardInad = document.getElementById("cardInad");
  const cardClientes = document.getElementById("cardClientesInad");
  const cardTicket = document.getElementById("cardTicket");

  if (cardReceita) cardReceita.textContent = "…";
  if (cardInad) cardInad.textContent = "…";
  if (cardClientes) cardClientes.textContent = "…";
  if (cardTicket) cardTicket.textContent = "…";

  const [dataInad, dataVend] = await Promise.all([
    apiGetInad(pathInad),
    apiGetInad(pathVend)
  ]);

  ultimoDashboardData = dataInad || null;

  if (cardReceita)
    cardReceita.textContent = fmtValor(dataVend.valor_venda_total || 0);
  if (cardInad)
    cardInad.textContent = fmtValor(dataInad.total_inadimplencia || 0);
  if (cardClientes)
    cardClientes.textContent = fmtInt(
      dataInad.qtde_clientes_inadimplentes || 0
    );
  if (cardTicket)
    cardTicket.textContent = fmtValor(dataInad.ticket_medio_geral || 0);

  return dataInad;
}

/* ========= MAPA / HEATMAP ========= */

async function initLeafletMap() {
  const mapDiv = document.getElementById("leafletMap");
  if (!mapDiv) {
    console.error("[MAPA] #leafletMap não encontrado no DOM");
    return;
  }

  if (leafletMap) {
    setTimeout(() => leafletMap.invalidateSize(), 100);
    return;
  }

  leafletMap = L.map("leafletMap", {
    attributionControl: false,
    zoomControl: true
  }).setView([-15, -50], 4);

  L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
    maxZoom: 19
  }).addTo(leafletMap);

  debugMarkerLayer = L.layerGroup().addTo(leafletMap);
}

function montarHeatmapAPartirClientes(clientes) {
  if (!leafletMap) return;

  const pontos = (clientes || [])
    .map(c => ({
      lat: c.lat != null ? Number(c.lat) : null,
      lng: c.lng != null ? Number(c.lng) : null,
      valor_inadimplencia: Number(c.valor_inadimplencia || 0),
      codparc: c.codparc,
      nome_cliente: c.nome_cliente,
      nome_vendedor: c.nome_vendedor
    }))
    .filter(
      c =>
        c.lat != null &&
        c.lng != null &&
        !isNaN(c.lat) &&
        !isNaN(c.lng)
    );

  if (!pontos.length) {
    if (heatLayer) heatLayer.setLatLngs([]);
    if (debugMarkerLayer) debugMarkerLayer.clearLayers();
    return;
  }

  if (debugMarkerLayer) {
    debugMarkerLayer.clearLayers();

    pontos.forEach(p => {
      const marker = L.marker([p.lat, p.lng], {
        icon: pontoIcon
      }).bindPopup(
        `Cliente: ${p.nome_cliente || p.codparc}<br>` +
          `Vendedor: ${p.nome_vendedor || "Sem vendedor"}<br>` +
          `Valor: ${fmtValor(p.valor_inadimplencia)}`
      );
      debugMarkerLayer.addLayer(marker);
    });
  }

  const valores = pontos.map(c => c.valor_inadimplencia);
  const maxValor = Math.max(...valores, 0.0001);
  const heatData = pontos.map(c => {
    const intensidadeBruta = c.valor_inadimplencia / maxValor;
    const intensidade = Math.max(Math.min(intensidadeBruta, 1), 0.3);
    return [c.lat, c.lng, intensidade];
  });

  if (!heatLayer) {
    heatLayer = L.heatLayer(heatData, {
      minOpacity: 0.4,
      maxZoom: 10,
      max: 1.0,
      radius: 35,
      blur: 22,
      gradient: {
        0.0: "#22c55e",
        0.3: "#84cc16",
        0.5: "#eab308",
        0.7: "#f97316",
        1.0: "#ef4444"
      }
    }).addTo(leafletMap);
  } else {
    heatLayer.setLatLngs(heatData);
  }

  const brasilBounds = L.latLngBounds(
    L.latLng(-33.7, -73.99),
    L.latLng(5.27, -34.79)
  );
  leafletMap.fitBounds(brasilBounds, { padding: [20, 20] });
}

/* ========= RANKING ========= */

function montarRankingAPartirClientes(clientes) {
  const tbody = document.getElementById("tbodyRanking");
  if (!tbody) return;

  const vendedorFiltro =
    (document.getElementById("fVendedor")?.value || "")
      .toString()
      .trim();
  const vendedorNomeFiltro = (
    document.getElementById("fVendedorNome")?.value || ""
  )
    .toString()
    .trim()
    .toLowerCase();

  const map = new Map();

  (clientes || []).forEach(c => {
    const nome = c.nome_vendedor || "Sem Vendedor";
    if (!map.has(nome)) {
      map.set(nome, { nome_vendedor: nome, valor: 0, clientes: new Set() });
    }
    const item = map.get(nome);
    item.valor += Number(c.valor_inadimplencia || 0);
    item.clientes.add(c.codparc);
  });

  let rows = Array.from(map.values()).map(v => ({
    nome_vendedor: v.nome_vendedor,
    inadimplencia_valor: v.valor,
    qtde_clientes_inad: v.clientes.size
  }));

  if (vendedorNomeFiltro) {
    rows = rows.filter(r =>
      (r.nome_vendedor || "").toLowerCase().includes(vendedorNomeFiltro)
    );
  }

  if (!vendedorFiltro) {
    rows = rows.filter(r => (r.inadimplencia_valor || 0) > 0);
  }

  const totalGeral =
    rows.reduce((acc, r) => acc + (r.inadimplencia_valor || 0), 0) || 1;

  rows.forEach(r => {
    r.inadimplencia_perc_rtv = (r.inadimplencia_valor || 0) / totalGeral;
  });

  rows.sort(
    (a, b) =>
      (b.inadimplencia_valor || 0) - (a.inadimplencia_valor || 0)
  );

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-state">
          Nenhum dado de ranking para os filtros.
        </td>
      </tr>
    `;
    return;
  }

  let html = "";
  rows.forEach((r, index) => {
    const nomeFull = r.nome_vendedor || "—";
    const nome = truncarNomeVendedor(nomeFull, 12);
    const valor = r.inadimplencia_valor || 0;
    const perc = r.inadimplencia_perc_rtv || 0;
    const clientesQtd = r.qtde_clientes_inad || 0;

    html += `
      <tr ${index >= 12 ? 'data-extra="1"' : ""}>
        <td title="${nomeFull}">${nome}</td>
        <td class="num ranking-clientes-cell" data-vendedor="${encodeURIComponent(
          nomeFull
        )}" style="cursor:pointer" title="Clique para ver os clientes">
          ${fmtInt(clientesQtd)}
        </td>
        <td class="num">${fmtValor(valor)}</td>
        <td class="num">${fmtPerc(perc)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  const cells = tbody.querySelectorAll(".ranking-clientes-cell");
  cells.forEach(cell => {
    cell.addEventListener("click", () => {
      const vendedorNome = decodeURIComponent(
        cell.getAttribute("data-vendedor") || ""
      );
      if (!ultimoDashboardData) return;
      const todos = ultimoDashboardData.clientes || [];
      const filtrados = todos.filter(
        c => (c.nome_vendedor || "Sem Vendedor") === vendedorNome
      );
      abrirModalClientes({
        origem: "ranking",
        titulo: `Clientes de ${vendedorNome}`,
        clientes: filtrados
      });
    });
  });
}

/* ========= BUSCA RÁPIDA DE CLIENTE ========= */

async function buscarClientePorNome() {
  const termo = (document.getElementById("fClienteNome")?.value || "").trim();
  const container = document.getElementById("clienteBuscaResultados");
  if (!container) return;

  if (!termo || termo.length < 3) {
    container.innerHTML = "";
    return;
  }

  const qs = getFiltrosQueryString({ clienteNome: termo });
  const path = `/inadimplencia/dashboard${qs}`;

  try {
    const data = await apiGetInad(path);
    const clientes = data.clientes || [];
    if (!clientes.length) {
      container.innerHTML = "<span>Nenhum cliente encontrado.</span>";
      return;
    }

    const items = clientes
      .slice(0, 20)
      .map(c => {
        const nome = c.nome_cliente || "";
        const vendedor = c.nome_vendedor || "Sem vendedor";
        const valor = fmtValor(c.valor_inadimplencia || 0);
        return `
          <li>
            <span class="nome">${nome}</span>
            <span class="vendedor">${vendedor}</span>
            <span class="valor">${valor}</span>
          </li>
        `;
      })
      .join("");

    container.innerHTML = `
      <span>Clientes inadimplentes encontrados:</span>
      <ul>
        ${items}
      </ul>
    `;
  } catch (e) {
    console.error("[BUSCA-CLIENTE] Erro ao carregar dashboard com clienteNome:", e);
  }
}

/* ========= MODAL DE CLIENTES ========= */

function inicializarModalClientes() {
  const modal = document.getElementById("clientesModal");
  const backdrop = document.getElementById("clientesModalBackdrop");
  const btnClose = document.getElementById("clientesModalClose");
  const btnCloseFooter = document.getElementById("clientesModalCloseFooter");

  if (!modal) return;

  const fechar = () => fecharModalClientes();

  if (backdrop) backdrop.addEventListener("click", fechar);
  if (btnClose) btnClose.addEventListener("click", fechar);
  if (btnCloseFooter) btnCloseFooter.addEventListener("click", fechar);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      fecharModalClientes();
    }
  });
}

function abrirModalClientes({ origem, titulo, clientes }) {
  const modal = document.getElementById("clientesModal");
  const tituloEl = document.getElementById("clientesModalTitulo");
  const infoEl = document.getElementById("clientesModalInfo");
  const tbody = document.getElementById("clientesModalTbody");

  if (!modal || !tituloEl || !infoEl || !tbody) return;

  tituloEl.textContent = titulo || "Clientes inadimplentes";

  const lista = clientes || [];
  const totalValor = lista.reduce(
    (acc, c) => acc + Number(c.valor_inadimplencia || 0),
    0
  );

  infoEl.innerHTML = `
    <div><strong>Quantidade de clientes:</strong> ${fmtInt(lista.length)}</div>
    <div><strong>Valor total inadimplente:</strong> ${fmtValor(totalValor)}</div>
    <div><strong>Origem:</strong> ${
      origem === "ranking" ? "Ranking de vendedores" : "Card geral"
    }</div>
  `;

  if (!lista.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Nenhum cliente para exibir.</td>
      </tr>
    `;
  } else {
    let html = "";
    lista.forEach(c => {
      const regiao = c.regiao != null ? c.regiao : "–";
      const nomeCliente = c.nome_cliente || "";
      const nomeVendedor = c.nome_vendedor || "Sem vendedor";
      const valor = fmtValor(c.valor_inadimplencia || 0);

      html += `
        <tr>
          <td>${c.codparc != null ? c.codparc : ""}</td>
          <td>${nomeCliente}</td>
          <td>${nomeVendedor}</td>
          <td>${regiao}</td>
          <td>${valor}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("clientes-modal-open");
}

function fecharModalClientes() {
  const modal = document.getElementById("clientesModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.classList.remove("clientes-modal-open");
}

/* ========= ORQUESTRAÇÃO ========= */

async function atualizarTudo() {
  console.log("========== [INAD][ATUALIZAR TUDO] ==========");
  try {
    const dataDash = await carregarDashboard();
    await initLeafletMap();
    montarHeatmapAPartirClientes(dataDash.clientes || []);
    montarRankingAPartirClientes(dataDash.clientes || []);
    console.log("[INAD][ATUALIZAR TUDO] Concluído com sucesso");
  } catch (e) {
    console.error("[INAD][ATUALIZAR TUDO] Erro:", e);
    alert("Erro ao carregar dados: " + e.message);
  }
}
