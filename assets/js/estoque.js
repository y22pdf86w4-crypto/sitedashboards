// assets/js/estoque.js

const API_BASE = "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net";

let estoqueBruto = [];
let itensFiltrados = [];

window.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");
  const btnToggle = document.getElementById("btnToggleSidebar");
  if (app && btnToggle) {
    btnToggle.addEventListener("click", () => {
      app.classList.toggle("sidebar-collapsed");
      ajustarAlturaTabela();
    });
  }

  const btnBuscar = document.getElementById("btnBuscar");
  const btnLimpar = document.getElementById("btnLimpar");

  if (btnBuscar) btnBuscar.addEventListener("click", carregarEstoque);
  if (btnLimpar) btnLimpar.addEventListener("click", limparFiltros);

  document.getElementById("fEmpresaNome")?.addEventListener("input", aplicarFiltroLocal);
  document.getElementById("fGrupoNome")?.addEventListener("input", aplicarFiltroLocal);
  document.getElementById("fProdNome")?.addEventListener("input", aplicarFiltroLocal);
  document.getElementById("fGrupoCod")?.addEventListener("input", aplicarFiltroLocal);
  document.getElementById("fProdCod")?.addEventListener("input", aplicarFiltroLocal);

  window.addEventListener("resize", ajustarAlturaTabela);

  carregarEstoque();
});

function limparFiltros() {
  document.getElementById("fEmpresaNome").value = "";
  document.getElementById("fGrupoCod").value = "";
  document.getElementById("fGrupoNome").value = "";
  document.getElementById("fProdCod").value = "";
  document.getElementById("fProdNome").value = "";
  carregarEstoque();
}

async function carregarEstoque() {
  const tbody = document.getElementById("tbodyEstoque");
  const cardEstoqueTotal = document.getElementById("cardEstoqueTotal");
  const cardReservadoTotal = document.getElementById("cardReservadoTotal");
  const cardDisponivelTotal = document.getElementById("cardDisponivelTotal");
  const cardQtdeGrupos = document.getElementById("cardQtdeGrupos");
  const infoRegistros = document.getElementById("infoRegistros");

  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td colspan="8" class="empty-state">
        Carregando dados de estoque...
      </td>
    </tr>
  `;
  if (infoRegistros) infoRegistros.textContent = "Carregando...";

  const grupoCodRaw = document.getElementById("fGrupoCod")?.value.trim() || "";
  const grupoCod = grupoCodRaw ? grupoCodRaw : "";
  const grupoNomeFiltro = document.getElementById("fGrupoNome")?.value.trim() || "";
  const codprodRaw = document.getElementById("fProdCod")?.value.trim() || "";
  const codprod = codprodRaw ? parseInt(codprodRaw, 10) : null;

  const params = new URLSearchParams();
  if (grupoCod) params.set("grupo", grupoCod);
  else if (grupoNomeFiltro) params.set("grupo", grupoNomeFiltro);
  if (codprod && !Number.isNaN(codprod)) params.set("codprod", String(codprod));

  const url =
    API_BASE + "/api/v1/estoque" + (params.toString() ? "?" + params.toString() : "");

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error("HTTP " + resp.status);
    }
    const data = await resp.json();
    estoqueBruto = data && Array.isArray(data.estoque) ? data.estoque : [];

    if (estoqueBruto.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            Nenhum registro encontrado para os filtros atuais.
          </td>
        </tr>
      `;
      cardEstoqueTotal.textContent = "0,00";
      cardReservadoTotal.textContent = "0,00";
      cardDisponivelTotal.textContent = "0,00";
      cardQtdeGrupos.textContent = "0";
      if (infoRegistros) infoRegistros.textContent = "Mostrando 0 de 0 registros";
      return;
    }

    aplicarFiltroLocal();
  } catch (e) {
    console.error("Erro ao carregar estoque:", e);
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          Erro ao carregar dados de estoque (API). Tente novamente mais tarde.
        </td>
      </tr>
    `;
    if (cardEstoqueTotal) cardEstoqueTotal.textContent = "—";
    if (cardReservadoTotal) cardReservadoTotal.textContent = "—";
    if (cardDisponivelTotal) cardDisponivelTotal.textContent = "—";
    if (cardQtdeGrupos) cardQtdeGrupos.textContent = "—";
    if (infoRegistros) infoRegistros.textContent = "Erro ao carregar";
  }
}

function aplicarFiltroLocal() {
  const tbody = document.getElementById("tbodyEstoque");
  const cardEstoqueTotal = document.getElementById("cardEstoqueTotal");
  const cardReservadoTotal = document.getElementById("cardReservadoTotal");
  const cardDisponivelTotal = document.getElementById("cardDisponivelTotal");
  const cardQtdeGrupos = document.getElementById("cardQtdeGrupos");
  const infoRegistros = document.getElementById("infoRegistros");

  if (!tbody) return;

  const nomeEmpresaFiltro = (document.getElementById("fEmpresaNome")?.value || "").toLowerCase();
  const nomeProdFiltro    = (document.getElementById("fProdNome")?.value || "").toLowerCase();
  const nomeGrupoFiltro   = (document.getElementById("fGrupoNome")?.value || "").toLowerCase();
  const grupoCodFiltroRaw = (document.getElementById("fGrupoCod")?.value || "").trim();
  const prodCodFiltroRaw  = (document.getElementById("fProdCod")?.value || "").trim();

  const grupoCodFiltro = grupoCodFiltroRaw ? grupoCodFiltroRaw : null;
  const prodCodFiltro  = prodCodFiltroRaw  ? prodCodFiltroRaw  : null;

  let itens = estoqueBruto.slice();

  if (nomeEmpresaFiltro) {
    itens = itens.filter(r => {
      const nomeEmpBruto = String(r.NomeEmpresa ?? r.nomeEmpresa ?? "");
      const base = nomeEmpBruto.split("-")[0].trim();
      return base.toLowerCase().includes(nomeEmpresaFiltro);
    });
  }

  if (nomeGrupoFiltro) {
    itens = itens.filter(r => {
      const grp = String(r.NomeGrupoProduto ?? r.nomeGrupoProduto ?? "").toLowerCase();
      return grp.includes(nomeGrupoFiltro);
    });
  }

  if (grupoCodFiltro) {
    itens = itens.filter(r => {
      const codGrupo = String(
        r.CODGRUPO ?? r.codgrupo ?? r.CODGRUPOPROD ?? r.codgrupoprod ?? ""
      ).trim();
      return codGrupo === grupoCodFiltro;
    });
  }

  if (nomeProdFiltro) {
    itens = itens.filter(r => {
      const nome = String(r.NomeProduto ?? r.nomeProduto ?? "").toLowerCase();
      return nome.includes(nomeProdFiltro);
    });
  }

  if (prodCodFiltro) {
    itens = itens.filter(r => {
      const cod = String(r.CODPROD ?? r.codprod ?? "").trim();
      return cod === prodCodFiltro;
    });
  }

  itensFiltrados = itens;

  if (itensFiltrados.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          Nenhum registro após aplicar os filtros.
        </td>
      </tr>
    `;
    cardEstoqueTotal.textContent = "0,00";
    cardReservadoTotal.textContent = "0,00";
    cardDisponivelTotal.textContent = "0,00";
    cardQtdeGrupos.textContent = "0";
    if (infoRegistros) infoRegistros.textContent = "Mostrando 0 de 0 registros";
    return;
  }

  let html = "";
  let totalEstoque = 0;
  let totalReservado = 0;
  const gruposSet = new Set();

  for (const r of itensFiltrados) {
    const estoque = Number(r.ESTOQUE ?? r.estoque ?? 0);
    const reservado = Number(r.RESERVADO ?? r.reservado ?? 0);
    totalEstoque += estoque;
    totalReservado += reservado;
    const grupoNomeFull = r.NomeGrupoProduto ?? r.nomeGrupoProduto ?? "";
    if (grupoNomeFull) gruposSet.add(grupoNomeFull);
  }

  for (const r of itensFiltrados) {
    const estoque = Number(r.ESTOQUE ?? r.estoque ?? 0);
    const reservado = Number(r.RESERVADO ?? r.reservado ?? 0);
    const disponivel = Number(
      r.EstoqueDisponivel ?? r.estoquedisponivel ?? estoque - reservado
    );

    const grupoNome = r.NomeGrupoProduto ?? r.nomeGrupoProduto ?? "";

    const nomeEmpresaBruto = r.NomeEmpresa ?? r.nomeEmpresa ?? "";
    let nomeEmpresaBase = nomeEmpresaBruto.split("-")[0].trim();
    nomeEmpresaBase = nomeEmpresaBase.replace(/\s+FILIAL\s+\d+$/i, "").trim();
    const nomeEmpresa = nomeEmpresaBase;

    const codProd = r.CODPROD ?? r.codprod ?? "";
    const nomeProdutoBruto = r.NomeProduto ?? r.nomeProduto ?? "";
    let nomeProdutoLimpo = nomeProdutoBruto.substring(0, 30);
    if (nomeProdutoBruto.length > 30) {
      nomeProdutoLimpo = nomeProdutoLimpo.trimEnd() + "…";
    }

    const statusClass = getStatusClass(estoque, reservado);
    const statusLabel = getStatusLabel(estoque, reservado);

    html += `
      <tr>
        <td>${r.CODEMP ?? r.codemp ?? ""}</td>
        <td><span class="badge-empresa">${escapeHtml(nomeEmpresa)}</span></td>
        <td>${escapeHtml(grupoNome)}</td>
        <td title="${escapeHtml(codProd + " - " + nomeProdutoBruto)}">
          ${escapeHtml(codProd + " - " + nomeProdutoLimpo)}
        </td>
        <td class="num">${formatNumber(estoque)}</td>
        <td class="num">${formatNumber(reservado)}</td>
        <td class="num">${formatNumber(disponivel)}</td>
        <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
  ajustarAlturaTabela();

  cardEstoqueTotal.textContent = formatNumber(totalEstoque);
  cardReservadoTotal.textContent = formatNumber(totalReservado);
  cardDisponivelTotal.textContent = formatNumber(totalEstoque - totalReservado);
  cardQtdeGrupos.textContent = String(gruposSet.size);
  if (infoRegistros) {
    infoRegistros.textContent =
      "Total filtrado: " + itensFiltrados.length + " registros";
  }
}

/**
 * Usa altura da janela:
 * - até 800px ~ 10 linhas (notebook / tela menor)
 * - acima de 800px ~ 15 linhas (monitor maior)
 */
function ajustarAlturaTabela() {
  const wrapper = document.querySelector(".table-wrapper");
  const tbody = document.getElementById("tbodyEstoque");
  if (!wrapper || !tbody) return;

  const firstRow = tbody.querySelector("tr");
  if (!firstRow) return;

  const rowHeight = firstRow.offsetHeight || 24;
  const header = wrapper.querySelector("thead");
  const headerHeight = header ? header.offsetHeight : 0;

  const altura = window.innerHeight || document.documentElement.clientHeight;

  let linhasVisiveis;
  if (altura <= 800) {
    linhasVisiveis = 10; // tela pequena: 9–11 linhas
  } else {
    linhasVisiveis = 15; // tela grande: preenche o espaço
  }

  const maxHeight = headerHeight + rowHeight * linhasVisiveis;
  wrapper.style.maxHeight = maxHeight + "px";
}

function formatNumber(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getStatusClass(estoque, reservado) {
  const disp = estoque - reservado;
  if (estoque <= 0) return "status-critico";
  if (disp <= 0) return "status-alerta";
  return "status-ok";
}

function getStatusLabel(estoque, reservado) {
  const disp = estoque - reservado;
  if (estoque <= 0) return "Sem estoque";
  if (disp <= 0) return "Sem disponível";
  return "OK";
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
