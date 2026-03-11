console.log("[CARTEIRA-ANALYTICS] carregado.");

function getApiBaseCarteira() {
  if (typeof window !== "undefined" && window.APIBASE) {
    return window.APIBASE;
  }
  // ajuste se o backend local usar outra base
  return "http://localhost:3000/api/v1";
}

let dadosBrutos = [];      // tudo que veio da API (1 página)
let dadosView  = [];       // após filtro/ordenacao
let linhasRenderizadas = 0;
let sortState = { colIndex: null, dir: "asc" };

/* ==== TOAST ==== */

function mostrarToastCarteira(msg) {
  const toast = document.getElementById("toastCarteira");
  const span = document.getElementById("toastCarteiraMsg");
  if (!toast || !span) return;
  span.textContent = msg;
  toast.classList.add("toast-ano-visible");
  toast.setAttribute("aria-hidden", "false");
  setTimeout(() => {
    toast.classList.remove("toast-ano-visible");
    toast.setAttribute("aria-hidden", "true");
  }, 3500);
}

/* ==== HELPERS ==== */

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function getUsuarioObrigatorioCarteira() {
  const user =
    typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  if (!user || !user.email) {
    window.location.href = "../index.html";
    return null;
  }
  return user;
}

function getAuthHeadersCarteira() {
  const user = getUsuarioObrigatorioCarteira();
  if (!user) return { "Content-Type": "application/json" };

  let headers = { "Content-Type": "application/json" };
  try {
    const token =
      (window.sessionStorage && sessionStorage.getItem("authToken")) || null;
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }
  } catch (e) {
    console.warn("[CARTEIRA][getAuthHeadersCarteira] Erro token:", e);
  }
  headers["x-usuario-email"] = user.email;
  return headers;
}

async function apiGetCarteira(page = 1, pageSize = 1000) {
  const base = getApiBaseCarteira();
  const qsFiltros = getFiltrosCarteiraQS();
  const url = `${base}/carteira-analytics?page=${page}&pageSize=${pageSize}${qsFiltros}`;
  console.log("[CARTEIRA][GET] URL:", url);

  const resp = await fetch(url, {
    method: "GET",
    headers: getAuthHeadersCarteira()
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error("[CARTEIRA][GET] HTTP != 200:", resp.status, txt);
    throw new Error("Erro HTTP " + resp.status);
  }

  const json = await resp.json();
  console.log("[CARTEIRA][GET] JSON:", json);
  return json;
}

function fmtValor(v) {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function fmtDataIso(d) {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("pt-BR");
}

function trunc40(value) {
  if (value == null) return "";
  const str = String(value);
  if (str.length <= 40) return str;
  return str.slice(0, 37) + "...";
}

/* ==== FILTROS / QS ==== */

function getFiltrosCarteiraQS() {
  const codvend = (document.getElementById("fVendedorCart")?.value || "").trim();
  const vendedor = (document.getElementById("fVendedorNomeCart")?.value || "").trim();
  const codparc = (document.getElementById("fClienteCart")?.value || "").trim();
  const cliente = (document.getElementById("fClienteNomeCart")?.value || "").trim();
  const cidade  = (document.getElementById("fCidadeCart")?.value || "").trim();
  const cultura = (document.getElementById("fCulturaCart")?.value || "").trim();
  const dtIni   = (document.getElementById("fDtIniCart")?.value || "").trim();
  const dtFim   = (document.getElementById("fDtFimCart")?.value || "").trim();

  const p = new URLSearchParams();
  if (codvend) p.append("codvend", codvend);
  if (vendedor) p.append("vendedor", vendedor);
  if (codparc) p.append("codparc", codparc);
  if (cliente) p.append("cliente", cliente);
  if (cidade) p.append("cidade", cidade);
  if (cultura) p.append("cultura", cultura);
  if (dtIni) p.append("dtInicio", dtIni);
  if (dtFim) p.append("dtFim", dtFim);

  const s = p.toString();
  return s ? "&" + s : "";
}

function limparFiltrosCarteira() {
  [
    "fVendedorCart",
    "fVendedorNomeCart",
    "fClienteCart",
    "fClienteNomeCart",
    "fCidadeCart",
    "fCulturaCart",
    "fDtIniCart",
    "fDtFimCart",
    "fBuscaGeral"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

/* ==== CARREGAR / VIEW ==== */

async function carregarCarteira() {
  const { carteiraAnalytics, pagination } = await apiGetCarteira(1, 1000);
  dadosBrutos = carteiraAnalytics || [];

  const info = document.getElementById("infoQtdeRegistros");
  if (info) {
    const total = pagination?.totalCount ?? dadosBrutos.length;
    info.textContent = `${total.toLocaleString("pt-BR")} registros (página ${pagination?.page || 1})`;
  }

  construirView();
}

function construirView() {
  const texto = (document.getElementById("fBuscaGeral")?.value || "")
    .trim()
    .toUpperCase();

  const filtrado = dadosBrutos.filter(reg => {
    if (!texto) return true;
    for (const v of Object.values(reg || {})) {
      if (v == null) continue;
      if (String(v).toUpperCase().includes(texto)) return true;
    }
    return false;
  });

  let ordenado = filtrado;
  if (sortState.colIndex !== null) {
    const ths = document.querySelectorAll("#tblCarteira thead th");
    const th = ths[sortState.colIndex];
    const field = th ? th.dataset.col : null;
    const dir = sortState.dir === "asc" ? 1 : -1;

    if (field) {
      ordenado = filtrado.slice().sort((a, b) => {
        const va = a[field];
        const vb = b[field];

        const na = Number(va);
        const nb = Number(vb);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) {
          if (na < nb) return -1 * dir;
          if (na > nb) return  1 * dir;
          return 0;
        }

        const da = new Date(va);
        const db = new Date(vb);
        if (!Number.isNaN(da.getTime()) && !Number.isNaN(db.getTime())) {
          if (da < db) return -1 * dir;
          if (da > db) return  1 * dir;
          return 0;
        }

        const sa = (va ?? "").toString().toUpperCase();
        const sb = (vb ?? "").toString().toUpperCase();
        if (sa < sb) return -1 * dir;
        if (sa > sb) return  1 * dir;
        return 0;
      });
    }
  }

  dadosView = ordenado;
  redesenharTabelaComLazy();
}

function redesenharTabelaComLazy() {
  const tbody = document.getElementById("tbodyCarteira");
  if (!tbody) return;

  if (!dadosView.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="40" class="empty-state">
          Nenhum dado para os filtros atuais.
        </td>
      </tr>
    `;
    linhasRenderizadas = 0;
    return;
  }

  tbody.innerHTML = "";
  linhasRenderizadas = 0;
  renderizarMaisLinhas(15);
}

function renderizarMaisLinhas(qtd) {
  const tbody = document.getElementById("tbodyCarteira");
  if (!tbody) return;

  const inicio = linhasRenderizadas;
  const fim = Math.min(inicio + qtd, dadosView.length);
  if (inicio >= fim) return;

  for (let i = inicio; i < fim; i++) {
    const c = dadosView[i];
    const tr = document.createElement("tr");

    function add(field, formatter) {
      const td = document.createElement("td");
      let raw = c[field];
      if (formatter) raw = formatter(raw);
      const full = raw == null ? "" : String(raw);
      td.textContent = trunc40(full);
      td.title = full;
      tr.appendChild(td);
    }

    // Ordem igual ao HTML
    add("CODVEND");
    add("NOME_VENDEDOR");
    add("CODPARC");
    add("ParceiroEnderecoCompl");
    add("NOME_CLIENTE");
    add("CODEMP");
    add("DTLIM", fmtDataIso);
    add("LIMCRED");

    add("ParceiroCodigo");
    add("ParceiroNome");
    add("ParceiroEnderecoCodigo");
    add("ParceiroEnderecoNumero");
    add("ParceiroBairroCodigo");
    add("ParceiroCidadeCodigo");
    add("ParceiroRegiaoCodigo");
    add("ParceiroCEP");
    add("ParceiroTelefone");
    add("ParceiroEmail");
    add("ParceiroLatitude");
    add("ParceiroLongitude");
    add("ParceiroLogradouro");
    add("ParceiroBairro");
    add("ParceiroCidade");
    add("ParceiroUFSigla");
    add("ParceiroUF_NUM");

    add("NroUnico");
    add("NumeroNota");
    add("DataVenda", fmtDataIso);
    add("ValorTotalVenda", fmtValor);
    add("VendedorQueVendeuCodigo");
    add("VendedorQueVendeuNome");
    add("CargoVendedorQueVendeu");

    add("IdAtividadeUltima");
    add("DtLancamentoUltimaAtividade", fmtDataIso);
    add("DtInicialUltimaAtividade", fmtDataIso);
    add("DtVisitaUltimaAtividade", fmtDataIso);

    add("LTV", fmtValor);

    tbody.appendChild(tr);
  }

  linhasRenderizadas = fim;
}

/* ==== INFINITE SCROLL LOCAL (15 em 15) ==== */

function initInfiniteScrollLocal() {
  const wrapper = document.querySelector(".table-wrapper");
  if (!wrapper) return;

  wrapper.addEventListener("scroll", () => {
    const nearBottom =
      wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 50;
    if (nearBottom) {
      renderizarMaisLinhas(15);
    }
  });
}

/* ==== SORT CABEÇALHO ==== */

function sortByColumn(colIndex) {
  const ths = document.querySelectorAll("#tblCarteira thead th");

  if (sortState.colIndex === colIndex) {
    sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
  } else {
    sortState.colIndex = colIndex;
    sortState.dir = "asc";
  }

  ths.forEach((th, idx) => {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (idx === colIndex) {
      th.classList.add(sortState.dir === "asc" ? "sorted-asc" : "sorted-desc");
    }
  });

  construirView();
}

/* ==== FILTRO GERAL ==== */

function aplicarFiltroGeral() {
  construirView();
}

/* ==== EXPORTAR EXCEL (todos os campos da VIEW, sem truncar) ==== */

function exportarTabelaParaExcel() {
  if (!dadosView.length) {
    mostrarToastCarteira("Não há dados para exportar.");
    return;
  }

  const table = document.getElementById("tblCarteira");
  if (!table) return;

  const cloned = table.cloneNode(true);
  const clTbody = cloned.tBodies[0];
  clTbody.innerHTML = "";

  dadosView.forEach(c => {
    const tr = document.createElement("tr");

    function add(field, formatter) {
      const td = document.createElement("td");
      let raw = c[field];
      if (formatter) raw = formatter(raw);
      td.textContent = raw == null ? "" : String(raw);
      tr.appendChild(td);
    }

    add("CODVEND");
    add("NOME_VENDEDOR");
    add("CODPARC");
    add("ParceiroEnderecoCompl");
    add("NOME_CLIENTE");
    add("CODEMP");
    add("DTLIM", fmtDataIso);
    add("LIMCRED");

    add("ParceiroCodigo");
    add("ParceiroNome");
    add("ParceiroEnderecoCodigo");
    add("ParceiroEnderecoNumero");
    add("ParceiroBairroCodigo");
    add("ParceiroCidadeCodigo");
    add("ParceiroRegiaoCodigo");
    add("ParceiroCEP");
    add("ParceiroTelefone");
    add("ParceiroEmail");
    add("ParceiroLatitude");
    add("ParceiroLongitude");
    add("ParceiroLogradouro");
    add("ParceiroBairro");
    add("ParceiroCidade");
    add("ParceiroUFSigla");
    add("ParceiroUF_NUM");

    add("NroUnico");
    add("NumeroNota");
    add("DataVenda", fmtDataIso);
    add("ValorTotalVenda", fmtValor);
    add("VendedorQueVendeuCodigo");
    add("VendedorQueVendeuNome");
    add("CargoVendedorQueVendeu");

    add("IdAtividadeUltima");
    add("DtLancamentoUltimaAtividade", fmtDataIso);
    add("DtInicialUltimaAtividade", fmtDataIso);
    add("DtVisitaUltimaAtividade", fmtDataIso);

    add("LTV", fmtValor);

    clTbody.appendChild(tr);
  });

  const blob = new Blob(
    ['\ufeff' + cloned.outerHTML],
    { type: "application/vnd.ms-excel;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const hoje = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `carteira-analytics-${hoje}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ==== RESIZE COLUNAS ==== */

function initColumnResize() {
  const ths = document.querySelectorAll("#tblCarteira thead th");
  ths.forEach(th => {
    const handle = document.createElement("div");
    handle.className = "col-resize-handle";
    th.appendChild(handle);

    let startX;
    let startWidth;

    handle.addEventListener("mousedown", e => {
      e.preventDefault();
      startX = e.pageX;
      startWidth = th.offsetWidth;
      th.classList.add("resizing");

      function onMouseMove(ev) {
        const delta = ev.pageX - startX;
        const newWidth = Math.max(60, startWidth + delta);
        th.style.width = newWidth + "px";
        th.style.minWidth = newWidth + "px";

        const idx = Array.from(th.parentNode.children).indexOf(th);
        const tds = document.querySelectorAll(`#tblCarteira tbody tr td:nth-child(${idx + 1})`);
        tds.forEach(td => {
          td.style.width = newWidth + "px";
          td.style.minWidth = newWidth + "px";
        });
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        th.classList.remove("resizing");
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  });
}

/* ==== DRAG & DROP COLUNAS ==== */

function initColumnDrag() {
  const ths = document.querySelectorAll("#tblCarteira thead th");
  let dragSrcIndex = null;

  ths.forEach((th, index) => {
    th.draggable = true;

    th.addEventListener("dragstart", e => {
      dragSrcIndex = index;
      th.classList.add("drag-source");
      e.dataTransfer.effectAllowed = "move";
    });

    th.addEventListener("dragover", e => {
      e.preventDefault();
      th.classList.add("drag-over");
    });

    th.addEventListener("dragleave", () => {
      th.classList.remove("drag-over");
    });

    th.addEventListener("drop", e => {
      e.preventDefault();
      th.classList.remove("drag-over");
      const destIndex = Array.from(th.parentNode.children).indexOf(th);
      if (dragSrcIndex === null || dragSrcIndex === destIndex) return;

      moveTableColumn(dragSrcIndex, destIndex);
      dragSrcIndex = null;
      document
        .querySelectorAll("#tblCarteira thead th")
        .forEach(th2 => th2.classList.remove("drag-source"));

      if (sortState.colIndex !== null) {
        if (sortState.colIndex === dragSrcIndex) {
          sortState.colIndex = destIndex;
        } else if (
          sortState.colIndex > dragSrcIndex &&
          sortState.colIndex <= destIndex
        ) {
          sortState.colIndex -= 1;
        } else if (
          sortState.colIndex < dragSrcIndex &&
          sortState.colIndex >= destIndex
        ) {
          sortState.colIndex += 1;
        }
      }
    });

    th.addEventListener("dragend", () => {
      dragSrcIndex = null;
      ths.forEach(th2 => th2.classList.remove("drag-source", "drag-over"));
    });
  });
}

function moveTableColumn(fromIndex, toIndex) {
  const table = document.getElementById("tblCarteira");
  if (!table) return;

  const rows = table.rows;
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].cells;
    if (toIndex < fromIndex) {
      rows[i].insertBefore(cells[fromIndex], cells[toIndex]);
    } else {
      rows[i].insertBefore(cells[fromIndex], cells[toIndex + 1]);
    }
  }
}

/* ==== INIT ==== */

async function atualizarTudoCarteira() {
  console.log("========== [CARTEIRA-ANALYTICS][ATUALIZAR] ==========");
  try {
    await carregarCarteira();
  } catch (e) {
    console.error("[CARTEIRA-ANALYTICS][ATUALIZAR] Erro:", e);
    mostrarToastCarteira(e.message || "Erro ao carregar carteira");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const user = getUsuarioObrigatorioCarteira();
  if (!user) return;

  const btnAplicar = document.getElementById("btnAplicarCart");
  const btnLimpar  = document.getElementById("btnLimparCart");
  const btnExport  = document.getElementById("btnExportExcelCart");

  if (btnAplicar) btnAplicar.addEventListener("click", atualizarTudoCarteira);
  if (btnLimpar) {
    btnLimpar.addEventListener("click", () => {
      limparFiltrosCarteira();
      atualizarTudoCarteira();
    });
  }
  if (btnExport) btnExport.addEventListener("click", exportarTabelaParaExcel);

  const idsFiltrosApi = [
    "fVendedorCart",
    "fVendedorNomeCart",
    "fClienteCart",
    "fClienteNomeCart",
    "fCidadeCart",
    "fCulturaCart",
    "fDtIniCart",
    "fDtFimCart"
  ];
  const debouncedAtualizarApi = debounce(atualizarTudoCarteira, 600);
  idsFiltrosApi.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evt, debouncedAtualizarApi);
  });

  const fBusca = document.getElementById("fBuscaGeral");
  if (fBusca) {
    fBusca.addEventListener("input", debounce(aplicarFiltroGeral, 250));
  }

  document
    .querySelectorAll("#tblCarteira thead th")
    .forEach((th, idx) => {
      th.addEventListener("click", e => {
        if (e.target.classList.contains("col-resize-handle")) return;
        sortByColumn(idx);
      });
    });

  initColumnResize();
  initColumnDrag();
  initInfiniteScrollLocal();
  atualizarTudoCarteira();
});
