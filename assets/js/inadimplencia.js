// assets/js/inadimplencia.js

const API_BASE =
  "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net";

let leafletMap = null;
let heatLayer = null;
let debugMarkerLayer = null;

const pontoIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34]
});

console.log("[INIT] Script inadimplencia.js carregado");

// CSS crítico do mapa
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

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

window.addEventListener("DOMContentLoaded", () => {
  console.log("[INIT] DOMContentLoaded");

  // default: ano atual, se vazio
  const fAno = document.getElementById("fAno");
  if (fAno && !fAno.value) {
    fAno.value = new Date().getFullYear();
  }

  const app = document.getElementById("app");
  const btnToggle = document.getElementById("btnToggleSidebar");
  if (app && btnToggle) {
    btnToggle.addEventListener("click", () => {
      app.classList.toggle("sidebar-collapsed");
      if (leafletMap) {
        setTimeout(() => {
          leafletMap.invalidateSize();
        }, 200);
      }
    });
  }

  const btnAplicar = document.getElementById("btnAplicar");
  const btnLimpar = document.getElementById("btnLimpar");

  if (btnAplicar) {
    btnAplicar.addEventListener("click", () => {
      console.log("[FILTRO] Botão Aplicar clicado");
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

  // filtros que podem atualizar automaticamente (com validação de ano)
  const inputsAuto = [
    "fAno",
    "fMes",
    "fRegiao",
    "fVendedor",
    "fVendedorNome",
    "fCliente"
  ];
  const debouncedAtualizar = debounce(() => {
    // Só atualiza se ano estiver válido ou em branco (nesse caso backend usa padrão)
    if (!anoValidoOuVazio()) {
      console.log("[FILTRO] Ano incompleto, não atualiza ainda");
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

  // busca rápida por nome de cliente
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

  atualizarTudo();
});

function anoValidoOuVazio() {
  const fAno = document.getElementById("fAno");
  if (!fAno) return true;
  const str = (fAno.value || "").trim();
  if (!str) return true; // deixa backend usar default se quiser
  if (str.length !== 4) return false;
  const n = Number(str);
  return !Number.isNaN(n) && n >= 2000 && n <= 2100;
}

function limparFiltros() {
  console.log("[FILTRO] limparFiltros executado");

  const anoAtual = new Date().getFullYear();
  const fAno = document.getElementById("fAno");
  if (fAno) fAno.value = anoAtual; // sempre ano completo

  const fMes = document.getElementById("fMes");
  if (fMes) fMes.value = "";

  document.getElementById("fRegiao").value = "";
  document.getElementById("fVendedor").value = "";
  document.getElementById("fVendedorNome").value = "";
  document.getElementById("fCliente").value = "";

  const fClienteNome = document.getElementById("fClienteNome");
  if (fClienteNome) fClienteNome.value = "";

  const resCliente = document.getElementById("clienteBuscaResultados");
  if (resCliente) resCliente.innerHTML = "";
}

// monta querystring com ano/mês separados
function getFiltrosQueryString(extra = {}) {
  const anoStr = (document.getElementById("fAno")?.value || "").trim();
  const mesStr = (document.getElementById("fMes")?.value || "").trim(); // "01".."12" ou ""
  const regiao = document.getElementById("fRegiao").value || "";
  const vendedor = document.getElementById("fVendedor").value || "";
  const vendedorNome = document.getElementById("fVendedorNome").value || "";
  const cliente = document.getElementById("fCliente").value || "";

  const params = new URLSearchParams();

  // DATA: só gera se ano tiver 4 dígitos e estiver no range
  const anoNum = Number(anoStr);
  const anoOk =
    anoStr.length === 4 &&
    !Number.isNaN(anoNum) &&
    anoNum >= 2000 &&
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

  const qs = params.toString(); // sem '?'.[web:43]
  console.log("[FILTRO] QueryString gerada:", qs);
  return qs ? "?" + qs : "";
}

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

/* ======================= DASHBOARD ======================= */
async function carregarDashboard() {
  const qs = getFiltrosQueryString();
  const urlInad = `${API_BASE}/api/v1/inadimplencia/dashboard${qs}`;
  const urlVend = `${API_BASE}/api/v1/vendas/dashboard${qs}`;

  console.log("[DASHBOARD] Requisição inadimplência:", urlInad);
  console.log("[DASHBOARD] Requisição vendas:", urlVend);

  const cardReceita = document.getElementById("cardReceitaTotal");
  const cardInad = document.getElementById("cardInad");
  const cardClientes = document.getElementById("cardClientesInad");
  const cardTicket = document.getElementById("cardTicket");

  cardReceita.textContent = "…";
  cardInad.textContent = "…";
  cardClientes.textContent = "…";
  cardTicket.textContent = "…";

  const [respInad, respVend] = await Promise.all([
    fetch(urlInad),
    fetch(urlVend)
  ]);

  console.log("[DASHBOARD] Status inad:", respInad.status);
  console.log("[DASHBOARD] Status vend:", respVend.status);

  if (!respInad.ok) throw new Error("Erro inadimplência " + respInad.status);
  if (!respVend.ok) throw new Error("Erro vendas " + respVend.status);

  const dataInad = await respInad.json();
  const dataVend = await respVend.json();

  cardReceita.textContent = fmtValor(dataVend.valor_venda_total || 0);
  cardInad.textContent = fmtValor(dataInad.total_inadimplencia || 0);
  cardClientes.textContent = fmtInt(
    dataInad.qtde_clientes_inadimplentes || 0
  );
  cardTicket.textContent = fmtValor(dataInad.ticket_medio_geral || 0);

  return dataInad;
}

/* ======================= MAPA / HEATMAP ======================= */

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

/* ======================= RANKING ======================= */

function montarRankingAPartirClientes(clientes) {
  const tbody = document.getElementById("tbodyRanking");
  if (!tbody) return;

  const vendedorFiltro = (document.getElementById("fVendedor").value || "")
    .toString()
    .trim();
  const vendedorNomeFiltro = (
    document.getElementById("fVendedorNome").value || ""
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
    const clientes = r.qtde_clientes_inad || 0;

    html += `
      <tr ${index >= 12 ? 'data-extra="1"' : ""}>
        <td title="${nomeFull}">${nome}</td>
        <td class="num">${fmtInt(clientes)}</td>
        <td class="num">${fmtValor(valor)}</td>
        <td class="num">${fmtPerc(perc)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

/* ======================= BUSCA RÁPIDA DE CLIENTE ======================= */

async function buscarClientePorNome() {
  const termo = (document.getElementById("fClienteNome").value || "").trim();
  const container = document.getElementById("clienteBuscaResultados");
  if (!container) return;

  if (!termo || termo.length < 3) {
    container.innerHTML = "";
    return;
  }

  const qs = getFiltrosQueryString({ clienteNome: termo });
  const url = `${API_BASE}/api/v1/inadimplencia/dashboard${qs}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    console.error("[BUSCA-CLIENTE] Erro dashboard com clienteNome", resp.status);
    return;
  }
  const data = await resp.json();

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
}

/* ======================= ORQUESTRAÇÃO ======================= */

async function atualizarTudo() {
  console.log("========== [ATUALIZAR TUDO] ==========");
  try {
    const dataDash = await carregarDashboard();
    await initLeafletMap();
    montarHeatmapAPartirClientes(dataDash.clientes || []);
    montarRankingAPartirClientes(dataDash.clientes || []);
    console.log("[ATUALIZAR TUDO] Concluído com sucesso");
  } catch (e) {
    console.error("[ATUALIZAR TUDO] Erro:", e);
    alert("Erro ao carregar dados: " + e.message);
  }
}
