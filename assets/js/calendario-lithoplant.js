// ================== CONFIGURAÇÕES ==================
const STORAGE_KEY = "calendario_pagamentos_litho";
const LOG_KEY = "calendario_pagamentos_litho_logs";
const CONTATOS_KEY = "calendario_pagamentos_litho_contatos";
const ADMIN_PASSWORD = "admin123";

let mesAtual = new Date();
let _idParaExcluir = null;
let _recorrenciaParaExcluir = null;

// contatos temporários selecionados na inclusão/edição de despesa
window._contatosSelecionadosTemp = [];

// ================== INIT ==================
function initPagina() {
  const user = validarAcessoEmpresa("lithoplant");
  if (user) {
    preencherHeaderUsuario(user, "saudacao", "userName");
  }
  gerarParticulasSelector(".particles-container", 18);
  initCalendario();
}

function initCalendario() {
  carregarDespesas();
  normalizarModeloDespesas();
  expandirRecorrencias();
  carregarContatos();
  renderizarCalendario();
}

// ================== PERSISTÊNCIA ==================
function carregarDespesas() {
  const data = localStorage.getItem(STORAGE_KEY);
  window._despesas = data ? JSON.parse(data) : [];
}

function salvarDespesas() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(window._despesas || []));
}

function carregarContatos() {
  const data = localStorage.getItem(CONTATOS_KEY);
  window._contatos = data ? JSON.parse(data) : [];
  if (!Array.isArray(window._contatos)) window._contatos = [];
}

function salvarContatos() {
  localStorage.setItem(CONTATOS_KEY, JSON.stringify(window._contatos || []));
}

// normalizar para novo modelo (responsaveis[], tiposAviso[], tipo)
function normalizarModeloDespesas() {
  if (!Array.isArray(window._despesas)) return;
  window._despesas = window._despesas.map(d => {
    const novo = { ...d };

    if (!Array.isArray(novo.responsaveis)) {
      const arr = [];
      if (novo.responsavel && novo.responsavel.telefone) arr.push(novo.responsavel);
      if (novo.alertar && novo.alertar.telefone) arr.push(novo.alertar);
      if (!arr.length && novo.telefone) {
        arr.push({
          nome: novo.responsavelNome || "Responsável",
          telefone: novo.telefone,
          tipo: "responsavel"
        });
      }
      novo.responsaveis = arr;
    } else {
      novo.responsaveis = novo.responsaveis.map(r => ({
        ...r,
        tipo: r.tipo || "responsavel"
      }));
    }

    if (!novo.tiposAviso) {
      if (typeof novo.diasAntes === "number") {
        novo.tiposAviso = [String(novo.diasAntes)];
      } else {
        novo.tiposAviso = ["3"];
      }
    } else if (typeof novo.tiposAviso === "string") {
      novo.tiposAviso = novo.tiposAviso.split(",").map(x => x.trim()).filter(Boolean);
    }

    delete novo.responsavel;
    delete novo.alertar;

    return novo;
  });
  salvarDespesas();
}

// ================== LOG ==================
function registrarLog(acao, despesa, detalhes) {
  const raw = localStorage.getItem(LOG_KEY);
  const logs = raw ? JSON.parse(raw) : [];
  const user = (typeof getUsuarioAtual === "function") ? getUsuarioAtual() : null;
  const usuario = user && (user.nome || user.email || "Desconhecido");

  logs.push({
    id: Date.now(),
    acao,
    despesaId: despesa.id,
    descricao: despesa.descricao,
    dataVenc: despesa.vencimento,
    usuario,
    dataAcao: new Date().toISOString(),
    detalhes: detalhes || null
  });

  localStorage.setItem(LOG_KEY, JSON.stringify(logs));
}

// ================== RECORRÊNCIA ==================
function expandirRecorrencias() {
  const hoje = new Date();
  const limite = new Date(hoje.getFullYear(), hoje.getMonth() + 12, 1);

  const existentes = window._despesas || [];
  const novas = [];

  existentes
    .filter(d => d.recorrente === "mensal" && !d.excluido)
    .forEach(d => {
      const [ano, mes, dia] = d.vencimento.split("-").map(Number);
      let base = new Date(ano, mes - 1, dia);

      while (base < limite) {
        const dataStr = base.toISOString().slice(0, 10);

        const jaExiste = existentes.some(
          x => x.vencimento === dataStr && x.descricao === d.descricao && !x.excluido
        );
        const jaNoNovo = novas.some(
          x => x.vencimento === dataStr && x.descricao === d.descricao
        );

        if (!jaExiste && !jaNoNovo) {
          novas.push({
            ...d,
            id: Date.now() + Math.random(),
            vencimento: dataStr,
            status: "pendente",
            dataPagamento: null
          });
        }
        base.setMonth(base.getMonth() + 1);
      }
    });

  if (novas.length > 0) {
    window._despesas = existentes.concat(novas);
    salvarDespesas();
  }
}

// ================== UTILS ==================
function mudarMes(delta) {
  mesAtual.setMonth(mesAtual.getMonth() + delta);
  renderizarCalendario();
}

function formatarMesAno(date) {
  const meses = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
  ];
  return meses[date.getMonth()] + " de " + date.getFullYear();
}

function dataISO(d) {
  return d.toISOString().slice(0, 10);
}

// ================== CONTATOS – GERENCIADOR ==================
function abrirGerenciadorContatos() {
  carregarContatos();
  renderizarListaContatos();
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

function excluirContato(index) {
  if (!Array.isArray(window._contatos)) return;
  if (!confirm("Deseja realmente excluir este contato?")) return;
  window._contatos.splice(index, 1);
  salvarContatos();
  renderizarListaContatos();
  preencherSelectContatos();
}

function salvarContato(event) {
  event.preventDefault();
  const nome = document.getElementById("contatoNome").value.trim();
  const telefone = document.getElementById("contatoTelefone").value.trim();
  if (!nome || !telefone) return;

  if (!Array.isArray(window._contatos)) window._contatos = [];

  const idxStr = document.getElementById("contatoIndexEdicao").value;
  if (idxStr !== "") {
    const idx = Number(idxStr);
    if (window._contatos[idx]) {
      window._contatos[idx] = { nome, telefone };
    }
  } else {
    window._contatos.push({ nome, telefone });
  }

  salvarContatos();
  renderizarListaContatos();
  preencherSelectContatos();
  document.getElementById("contatoIndexEdicao").value = "";
  document.getElementById("contatoNome").value = "";
  document.getElementById("contatoTelefone").value = "";
}

// ================== CONTATOS – SELECT DA DESPESA ==================
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
    btnTipo.style.background = c.tipo === "informativo" ? "#1d4ed8" : "#16a34a";
    btnTipo.style.color = "#f9fafb";
    btnTipo.textContent = c.tipo === "informativo" ? "Informar" : "Responsável";

    btnTipo.onclick = () => {
      const atual = window._contatosSelecionadosTemp[idx];
      if (!atual) return;
      atual.tipo = atual.tipo === "informativo" ? "responsavel" : "informativo";
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

// ================== RENDERIZAÇÃO ==================
function renderizarCalendario() {
  const titulo = document.getElementById("tituloMes");
  const grid = document.getElementById("gridDias");
  grid.innerHTML = "";

  const ano = mesAtual.getFullYear();
  const mes = mesAtual.getMonth();
  titulo.textContent = formatarMesAno(mesAtual);

  const primeiroDia = new Date(ano, mes, 1);
  const ultimoDia = new Date(ano, mes + 1, 0);
  const offsetSemana = primeiroDia.getDay();

  for (let i = 0; i < offsetSemana; i++) {
    const vazio = document.createElement("div");
    vazio.className = "day-cell";
    grid.appendChild(vazio);
  }

  const hojeISO = dataISO(new Date());

  for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
    const cell = document.createElement("div");
    cell.className = "day-cell";

    const dataAtual = new Date(ano, mes, dia);
    const dataStr = dataISO(dataAtual);

    cell.onclick = () => abrirModalDia(dataStr);
    cell.ondblclick = (e) => {
      e.stopPropagation();
      abrirModalInclusao(dataStr);
    };

    const numero = document.createElement("div");
    numero.className = "day-number";
    numero.textContent = dia;
    cell.appendChild(numero);

    const eventosDiv = document.createElement("div");
    eventosDiv.className = "day-events";

    const despesasDoDia = (window._despesas || []).filter(
      d => d.vencimento === dataStr && !d.excluido
    );

    despesasDoDia.forEach(despesa => {
      const pill = document.createElement("div");
      pill.className = "event-pill " + classeStatus(despesa, hojeISO);
      pill.textContent = despesa.descricao;
      pill.title = tooltipDespesa(despesa);
      eventosDiv.appendChild(pill);
    });

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

function tooltipDespesa(d) {
  const base = `${d.descricao} - vence em ${d.vencimento.split("-").reverse().join("/")}`;
  const recur = d.recorrente === "mensal" ? " (mensal)" : "";

  let respStr = "";
  if (Array.isArray(d.responsaveis) && d.responsaveis.length) {
    respStr =
      " | Notificar: " +
      d.responsaveis
        .map(r => {
          const tipoLabel = r.tipo === "informativo" ? "informar" : "responsável";
          return `${r.nome} (${r.telefone}, ${tipoLabel})`;
        })
        .join(" / ");
  }

  if (d.excluido) {
    return base + recur + respStr +
      ` | EXCLUÍDO por ${d.excluidoPor || "?"} em ${d.dataExclusao || "?"} (${d.motivoExclusao || "sem motivo"})`;
  }
  if (d.status === "pago" && d.dataPagamento) {
    return base + recur + respStr +
      ` | Pago em ${d.dataPagamento.split("-").reverse().join("/")}`;
  }
  return base + recur + respStr;
}

// ================== MODAL INCLUSÃO / EDIÇÃO ==================
function abrirModalInclusao(dataPre) {
  const modal = document.getElementById("modalInclusao");
  modal.style.display = "flex";

  const form = modal.querySelector("form");
  delete form.dataset.editId;

  document.getElementById("descricao").value = "";
  document.getElementById("dataVenc").value = dataPre || "";

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
  document.getElementById("modalInclusao").style.display = "none";
}

function editarDespesa(id) {
  fecharModalDia();

  const desp = (window._despesas || []).find(d => d.id === id && !d.excluido);
  if (!desp) return;

  if (desp.status === "pago") {
    alert("Esta despesa já está marcada como paga e não pode ser editada.");
    return;
  }

  const modal = document.getElementById("modalInclusao");
  modal.style.display = "flex";

  const form = modal.querySelector("form");
  form.dataset.editId = String(desp.id || "");

  document.getElementById("descricao").value = desp.descricao || "";
  document.getElementById("dataVenc").value = desp.vencimento || "";
  document.getElementById("recorrente").value = desp.recorrente || "nao";

  document.getElementById("aviso7").checked = Array.isArray(desp.tiposAviso) && desp.tiposAviso.includes("7");
  document.getElementById("aviso5").checked = Array.isArray(desp.tiposAviso) && desp.tiposAviso.includes("5");
  document.getElementById("aviso3").checked = Array.isArray(desp.tiposAviso) ? desp.tiposAviso.includes("3") : true;
  document.getElementById("aviso1").checked = Array.isArray(desp.tiposAviso) && desp.tiposAviso.includes("1");
  document.getElementById("aviso0").checked = Array.isArray(desp.tiposAviso) && desp.tiposAviso.includes("0");

  document.getElementById("extraNome").value = "";
  document.getElementById("extraTelefone").value = "";

  window._contatosSelecionadosTemp = Array.isArray(desp.responsaveis)
    ? desp.responsaveis.map(r => ({
        nome: r.nome,
        telefone: r.telefone,
        tipo: r.tipo || "responsavel"
      }))
    : [];

  preencherSelectContatos();
  renderizarChipsContatosSelecionados();

  document.getElementById("descricao").focus();
}

function salvarDespesa(event) {
  event.preventDefault();
  const modal = document.getElementById("modalInclusao");
  const form = modal.querySelector("form");
  const editId = form.dataset.editId ? Number(form.dataset.editId) : null;

  const descricao = document.getElementById("descricao").value.trim();
  const vencimento = document.getElementById("dataVenc").value;
  const recorrente = document.getElementById("recorrente").value;

  const tiposAviso = [];
  if (document.getElementById("aviso7").checked) tiposAviso.push("7");
  if (document.getElementById("aviso5").checked) tiposAviso.push("5");
  if (document.getElementById("aviso3").checked) tiposAviso.push("3");
  if (document.getElementById("aviso1").checked) tiposAviso.push("1");
  if (document.getElementById("aviso0").checked) tiposAviso.push("0");

  const marcados = (window._contatosSelecionadosTemp || []).map(c => ({
    nome: c.nome,
    telefone: c.telefone,
    tipo: c.tipo || "responsavel"
  }));

  const extraNome = document.getElementById("extraNome").value.trim();
  const extraTelefone = document.getElementById("extraTelefone").value.trim();
  if (extraTelefone) {
    marcados.push({
      nome: extraNome || "Contato",
      telefone: extraTelefone,
      tipo: "responsavel"
    });
  }

  if (!descricao || !vencimento || !marcados.length) {
    alert("Preencha descrição, data e pelo menos um contato para notificar.");
    return;
  }

  if (!window._despesas) window._despesas = [];

  if (editId) {
    window._despesas = window._despesas.map(d => {
      if (d.id === editId) {
        if (d.status === "pago") return d;
        const atualizado = {
          ...d,
          descricao,
          vencimento,
          responsaveis: marcados,
          tiposAviso,
          recorrente
        };
        registrarLog("EDITAR", atualizado, null);
        return atualizado;
      }
      return d;
    });
  } else {
    const nova = {
      id: Date.now(),
      descricao,
      vencimento,
      responsaveis: marcados,
      tiposAviso,
      recorrente,
      status: "pendente",
      dataPagamento: null,
      excluido: false,
      motivoExclusao: null,
      excluidoPor: null,
      dataExclusao: null
    };

    window._despesas.push(nova);
    registrarLog("CRIAR", nova, null);
  }

  salvarDespesas();
  expandirRecorrencias();
  fecharModalInclusao();

  const dataV = new Date(vencimento);
  mesAtual = new Date(dataV.getFullYear(), dataV.getMonth(), 1);
  renderizarCalendario();
}

// ================== MODAL DIA ==================
function abrirModalDia(dataISOdia) {
  const despesasDoDia = (window._despesas || []).filter(
    d => d.vencimento === dataISOdia && !d.excluido
  );
  const modal = document.getElementById("modalDia");
  const container = document.getElementById("listaDiaContainer");
  const titulo = document.getElementById("tituloModalDia");

  titulo.textContent = "Despesas de " + dataISOdia.split("-").reverse().join("/");
  container.innerHTML = "";

  if (despesasDoDia.length === 0) {
    const vazio = document.createElement("div");
    vazio.style.fontSize = "0.85rem";
    vazio.style.color = "#9ca3af";
    vazio.textContent = "Nenhuma despesa cadastrada para este dia.";
    container.appendChild(vazio);
  } else {
    const hojeISO = dataISO(new Date());
    despesasDoDia.forEach(d => {
      const item = document.createElement("div");
      item.className = "item-dia";

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
      if (Array.isArray(d.responsaveis) && d.responsaveis.length) {
        textoResp =
          "Notificar: " +
          d.responsaveis
            .map(r => {
              const tipoLabel = r.tipo === "informativo" ? "informar" : "responsável";
              return `${r.nome} (${r.telefone}, ${tipoLabel})`;
            })
            .join(" • ");
      }
      if (d.recorrente === "mensal") {
        if (textoResp) textoResp += " • ";
        textoResp += "recorrente (mensal)";
      }
      linhaResp.textContent = textoResp;

      const log = document.createElement("div");
      log.className = "item-dia-log";
      if (d.dataPagamento) {
        log.textContent = "Pago em " + d.dataPagamento.split("-").reverse().join("/");
      }

      const acoes = document.createElement("div");
      acoes.className = "item-dia-acoes";

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

      item.appendChild(header);
      item.appendChild(linhaResp);
      if (d.dataPagamento) item.appendChild(log);
      item.appendChild(acoes);

      container.appendChild(item);
    });
  }
  modal.style.display = "flex";
}

function fecharModalDia() {
  document.getElementById("modalDia").style.display = "none";
}

// ================== STATUS ==================
function alterarStatus(id, novoStatus) {
  const hoje = dataISO(new Date());
  let alvo = null;

  window._despesas = (window._despesas || []).map(d => {
    if (d.id === id) {
      const atualizado = {
        ...d,
        status: novoStatus,
        dataPagamento: novoStatus === "pago" ? hoje : null
      };
      alvo = atualizado;
      return atualizado;
    }
    return d;
  });

  if (alvo) {
    registrarLog(novoStatus === "pago" ? "PAGAR" : "PENDENTE", alvo, null);
  }

  salvarDespesas();
  renderizarCalendario();
  const alguma = window._despesas.find(d => d.id === id);
  if (alguma) abrirModalDia(alguma.vencimento);
}

// ================== EXCLUSÃO ==================
function excluirDespesa(id) {
  const desp = (window._despesas || []).find(d => d.id === id);
  if (!desp) return;

  fecharModalDia();

  _idParaExcluir = id;
  _recorrenciaParaExcluir = desp.recorrente === "mensal";

  document.getElementById("motivoExclusao").value = "";
  document.getElementById("erroMotivoExclusao").textContent = "";
  document.getElementById("erroSenhaExclusao").textContent = "";
  document.getElementById("senhaExclusao").value = "";

  const blocoRecorrencia = document.getElementById("blocoRecorrencia");
  const blocoSenha = document.getElementById("blocoSenhaExclusao");

  if (_recorrenciaParaExcluir) {
    blocoRecorrencia.style.display = "block";
  } else {
    blocoRecorrencia.style.display = "none";
  }

  if (desp.status === "pago") {
    blocoSenha.style.display = "block";
  } else {
    blocoSenha.style.display = "none";
  }

  document.getElementById("modalConfirmarExclusao").style.display = "flex";
}

function fecharModalExclusao() {
  document.getElementById("modalConfirmarExclusao").style.display = "none";
  _idParaExcluir = null;
  _recorrenciaParaExcluir = null;
}

function confirmarExclusaoDespesa() {
  if (!_idParaExcluir) {
    fecharModalExclusao();
    return;
  }

  const motivo = document.getElementById("motivoExclusao").value.trim();
  const erroMotivoEl = document.getElementById("erroMotivoExclusao");
  const erroSenhaEl = document.getElementById("erroSenhaExclusao");
  const senha = document.getElementById("senhaExclusao").value.trim();

  erroMotivoEl.textContent = "";
  erroSenhaEl.textContent = "";

  if (!motivo) {
    erroMotivoEl.textContent = "Informe o motivo da exclusão.";
    return;
  }

  const despBase = (window._despesas || []).find(d => d.id === _idParaExcluir);
  if (!despBase) {
    fecharModalExclusao();
    return;
  }

  let modo = "unico";
  if (_recorrenciaParaExcluir) {
    const radios = document.getElementsByName("modoExclusao");
    const selecionado = Array.from(radios).find(r => r.checked);
    modo = selecionado ? selecionado.value : "unico";
  }

  const afetadasPreview = (window._despesas || []).filter(d => {
    if (d.excluido) return false;

    const mesmaSerie =
      despBase.recorrente === "mensal" &&
      d.recorrente === "mensal" &&
      d.descricao === despBase.descricao;

    if (modo === "unico") {
      return d.id === despBase.id;
    }
    if (modo === "futuras") {
      return mesmaSerie && d.vencimento >= despBase.vencimento;
    }
    if (modo === "todas") {
      return mesmaSerie;
    }
    return false;
  });

  const temPaga = afetadasPreview.some(d => d.status === "pago");

  if (temPaga) {
    const blocoSenha = document.getElementById("blocoSenhaExclusao");
    blocoSenha.style.display = "block";

    if (!senha) {
      erroSenhaEl.textContent = "Informe a senha de administrador para excluir despesas pagas.";
      return;
    }
    if (senha !== ADMIN_PASSWORD) {
      erroSenhaEl.textContent = "Senha de administrador inválida.";
      return;
    }
  }

  aplicarExclusao(despBase, afetadasPreview, motivo, temPaga ? "EXCLUIR_PAGO" : "EXCLUIR");

  fecharModalExclusao();
}

function aplicarExclusao(despBase, afetadasPreview, motivoFinal, tipoLog) {
  const user = (typeof getUsuarioAtual === "function") ? getUsuarioAtual() : null;
  const nome = user && (user.nome || user.email || "Desconhecido");
  const hoje = dataISO(new Date());

  const idsAfetar = new Set(afetadasPreview.map(d => d.id));
  const afetadasFinal = [];

  window._despesas = (window._despesas || []).map(d => {
    if (idsAfetar.has(d.id)) {
      const atualizado = {
        ...d,
        excluido: true,
        motivoExclusao: motivoFinal,
        excluidoPor: nome,
        dataExclusao: hoje
      };
      afetadasFinal.push(atualizado);
      return atualizado;
    }
    return d;
  });

  salvarDespesas();
  renderizarCalendario();

  afetadasFinal.forEach(a => registrarLog(tipoLog, a, motivoFinal));

  if (despBase) abrirModalDia(despBase.vencimento);
}

// ================== MODAL RESULTADO ENVIO ==================
function abrirModalResultadoEnvio(envios, erroGeral) {
  const modal = document.getElementById("modalResultadoEnvio");
  const lista = document.getElementById("resultadoEnvioLista");
  if (!modal || !lista) return;

  lista.innerHTML = "";

  if (erroGeral) {
    const div = document.createElement("div");
    div.style.fontSize = "0.85rem";
    div.style.color = "#fecaca";
    div.textContent = "❌ Ocorreu um erro ao enviar os lembretes. Verifique o servidor de WhatsApp.";
    lista.appendChild(div);
    modal.style.display = "flex";
    return;
  }

  if (!Array.isArray(envios) || !envios.length) {
    const div1 = document.createElement("div");
    div1.style.fontSize = "0.85rem";
    div1.style.color = "#bbf7d0";
    div1.style.marginBottom = "6px";
    div1.textContent = "✅ Solicitação concluída, mas nenhuma mensagem foi enviada.";
    const div2 = document.createElement("div");
    div2.style.fontSize = "0.8rem";
    div2.style.color = "#9ca3af";
    div2.textContent = "Verifique se as despesas possuem contatos cadastrados corretamente.";
    lista.appendChild(div1);
    lista.appendChild(div2);
  } else {
    const topo = document.createElement("div");
    topo.style.fontSize = "0.85rem";
    topo.style.marginBottom = "8px";
    topo.style.color = "#bbf7d0";
    topo.textContent = `✅ Envio concluído. Mensagens enviadas para ${envios.length} contato(s):`;
    lista.appendChild(topo);

    envios.forEach(e => {
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
      detalhes.textContent = `Descr.: ${e.descricao || "-"} • Venc.: ${vencPtbr || "-"}`;

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

// ================== SELEÇÃO E ENVIO DE LEMBRETES ==================
function abrirModalSelecionarEnvio() {
  const ano = mesAtual.getFullYear();
  const mes = mesAtual.getMonth();

  const inicioISO = new Date(ano, mes, 1).toISOString().slice(0, 10);
  const fimISO = new Date(ano, mes + 1, 0).toISOString().slice(0, 10);

  const lista = document.getElementById("listaSelecionarEnvio");
  lista.innerHTML = "";

  const candidatos = (window._despesas || []).filter(d => {
    if (d.excluido) return false;
    if (!d.vencimento) return false;
    if (!Array.isArray(d.responsaveis) || !d.responsaveis.length) return false;
    return d.vencimento >= inicioISO && d.vencimento <= fimISO;
  });

  if (!candidatos.length) {
    const vazio = document.createElement("div");
    vazio.style.fontSize = "0.85rem";
    vazio.style.color = "#9ca3af";
    vazio.textContent = "Nenhuma despesa cadastrada neste mês com contatos para notificação.";
    lista.appendChild(vazio);
  } else {
    candidatos.forEach(d => {
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
      linha1.textContent = `${d.descricao} – vence em ${d.vencimento.split("-").reverse().join("/")}`;

      const linha2 = document.createElement("span");
      linha2.style.fontSize = "0.8rem";
      linha2.style.color = "#9ca3af";
      linha2.textContent =
        "Notificar: " +
        d.responsaveis
          .map(r => {
            const tipoLabel = r.tipo === "informativo" ? "informar" : "responsável";
            return `${r.nome} (${r.telefone}, ${tipoLabel})`;
          })
          .join(" / ");

      texto.appendChild(linha1);
      texto.appendChild(linha2);

      row.appendChild(checkbox);
      row.appendChild(texto);

      lista.appendChild(row);
    });
  }

  document.getElementById("modalSelecionarEnvio").style.display = "flex";
}

function fecharModalSelecionarEnvio() {
  document.getElementById("modalSelecionarEnvio").style.display = "none";
}

async function confirmarEnvioSelecionado() {
  const checks = Array.from(document.querySelectorAll(".chk-envio"))
    .filter(c => c.checked);

  if (!checks.length) {
    alert("Selecione pelo menos uma despesa para enviar.");
    return;
  }

  const idsSelecionados = new Set(checks.map(c => Number(c.value)));
  const selecionados = (window._despesas || []).filter(d => idsSelecionados.has(d.id));

  const user = getUsuarioAtual();
  const empresa = "lithoplant";

  try {
    const resp = await fetch("http://localhost:3000/api/enviar-lembretes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        empresa,
        usuarioEmail: user ? user.email : null,
        lembretes: selecionados
      })
    });

    fecharModalSelecionarEnvio();

    if (!resp.ok) {
      abrirModalResultadoEnvio([], true);
      return;
    }

    const data = await resp.json();
    abrirModalResultadoEnvio(data.envios || [], false);
  } catch (e) {
    console.error(e);
    fecharModalSelecionarEnvio();
    abrirModalResultadoEnvio([], true);
  }
}
