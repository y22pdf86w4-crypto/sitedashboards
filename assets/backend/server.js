// server.js
require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const cron = require("node-cron");
const cors = require("cors");
const { sendWhatsApp } = require("./whatsapp");

const app = express();

app.use(cors());
app.use(express.json());

// ================== CORS BÁSICO ==================
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.get("/ping", (req, res) => {
  res.send("ok");
});

// ================== HELPERS DE MENSAGEM ==================

function gerarSaudacao() {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

function formatarNome(nome) {
  if (!nome) return "";
  const limpo = String(nome).trim().toLowerCase();
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

function obterNomeResponsavelPrincipal(responsaveis) {
  if (!Array.isArray(responsaveis) || !responsaveis.length) return "o responsável";
  const resp = responsaveis.find(r => r.tipo === "responsavel") || responsaveis[0];
  return formatarNome(resp.nome || "o responsável");
}

/**
 * Monta mensagem personalizada por empresa
 * @param {object} despesa
 * @param {object} contato  { nome, telefone, tipo }
 * @param {string} nomeResponsavelPrincipal
 * @param {string} empresa  "linhagro" | "lithoplant"
 */
function montarMensagemWhatsApp(despesa, contato, nomeResponsavelPrincipal, empresa) {
  const saudacao = gerarSaudacao();
  const nomeContato = formatarNome(contato.nome || "cliente");
  const tipo = contato.tipo || "responsavel";

  const desc = despesa.descricao || "Despesa";
  const dataPtBr = despesa.vencimento
    ? despesa.vencimento.split("-").reverse().join("/")
    : "data não informada";

  const nomeEmpresa = empresa === "linhagro" ? "Linhagro" : "Lithoplant";

  const hojeISO = new Date().toISOString().slice(0, 10);
  let statusLinha = "";
  if (despesa.status === "pago") {
    statusLinha = `✅ Status: *pago* no calendário ${nomeEmpresa}.`;
  } else if (despesa.vencimento && despesa.vencimento < hojeISO) {
    statusLinha = `⚠️ Status: *vencido* no calendário ${nomeEmpresa}.`;
  } else {
    statusLinha = `⏳ Status: *pendente* no calendário ${nomeEmpresa}.`;
  }

  const topo =
    tipo === "responsavel"
      ? `🌙 ${saudacao}, ${nomeContato}! Tudo bem?\nAqui é da ${nomeEmpresa} passando um lembrete rápido sobre um pagamento em aberto:\n`
      : `🌙 ${saudacao}, ${nomeContato}! Tudo bem?\nAqui é da ${nomeEmpresa}. ${nomeResponsavelPrincipal} tem um pagamento em aberto e gostaríamos de avisar:\n`;

  const detalhes = [
    "📌 *Detalhes do pagamento*",
    `🏢 Empresa: ${nomeEmpresa}`,
    `🧾 Descrição: ${desc}`,
    `📅 Vencimento: ${dataPtBr}`
  ];

  const rodape = [
    "",
    statusLinha,
    "",
    "Pedimos, por gentileza, que verifique o pagamento assim que possível. 🙏",
    "Se o pagamento já foi realizado, por favor desconsidere esta mensagem."
  ];

  return topo + "\n" + detalhes.join("\n") + "\n\n" + rodape.join("\n");
}

// ================== ENVIO MANUAL (FRONT) ==================

app.post("/api/enviar-lembretes", async (req, res) => {
  const { empresa, usuarioEmail, lembretes } = req.body;

  if (!empresa || !["linhagro", "lithoplant"].includes(empresa)) {
    return res.status(400).json({ error: "Empresa inválida ou não informada." });
  }

  if (!Array.isArray(lembretes) || !lembretes.length) {
    return res.status(400).json({ error: "Nenhum lembrete recebido." });
  }

  let enviados = 0;
  const envios = [];
  const falhas = [];

  console.log(
    `Recebido para envio: ${lembretes.length} despesa(s), empresa=${empresa}, usuario=${usuarioEmail || "-"}`
  );

  for (const d of lembretes) {
    const responsaveis = Array.isArray(d.responsaveis) ? d.responsaveis : [];
    if (!responsaveis.length) {
      console.log("Despesa sem responsaveis, ignorando:", d.descricao);
      continue;
    }

    const nomeRespPrincipal = obterNomeResponsavelPrincipal(responsaveis);

    for (const contato of responsaveis) {
      if (!contato || !contato.telefone) {
        console.log("Contato inválido em despesa:", d.descricao, contato);
        falhas.push({
          telefone: contato && contato.telefone,
          nome: contato && contato.nome,
          descricao: d.descricao || "",
          motivo: "Telefone vazio ou contato inválido"
        });
        continue;
      }

      const texto = montarMensagemWhatsApp(d, contato, nomeRespPrincipal, empresa);

      try {
        const resultado = await sendWhatsApp(contato.telefone, texto);

        if (resultado === false || resultado === null) {
          console.error(
            "Falha ao enviar WhatsApp (retorno falso) para",
            contato.telefone,
            "descrição:",
            d.descricao
          );
          falhas.push({
            telefone: contato.telefone,
            nome: contato.nome || "",
            descricao: d.descricao || "",
            motivo: "Envio retornou falso (provável número inválido ou sem 55)"
          });
          continue;
        }

        enviados++;
        envios.push({
          telefone: contato.telefone,
          nome: contato.nome || "",
          descricao: d.descricao || "",
          vencimento: d.vencimento || "",
          empresa
        });

        console.log(
          "WhatsApp enviado para",
          contato.nome || contato.telefone,
          "descrição:",
          d.descricao,
          "empresa:",
          empresa
        );
      } catch (err) {
        console.error(
          "Erro ao enviar WhatsApp para",
          contato.telefone,
          err.message
        );
        falhas.push({
          telefone: contato.telefone,
          nome: contato.nome || "",
          descricao: d.descricao || "",
          motivo: err.message || "Erro inesperado ao enviar WhatsApp"
        });
      }
    }
  }

  const resumoSucesso = envios.map(e => `${e.nome || "Contato"} (${e.telefone})`).join(", ");
  const resumoFalhas = falhas.map(f => `${f.nome || "Contato"} (${f.telefone}) - ${f.motivo}`).join(" | ");

  console.log("Total de mensagens enviadas:", enviados);
  console.log("Resumo envios:", resumoSucesso || "nenhum");
  if (falhas.length) {
    console.log("Falhas de envio:", resumoFalhas);
  }

  return res.json({
    enviados,
    envios,
    falhas,
    resumoSucesso,
    resumoFalhas
  });
});

// ================== ENVIO AUTOMÁTICO DIÁRIO (08h) ==================

// Exemplo de .env:
// DESPESAS_API_URL=http://172.18.4.12:3000/api/v1
const DESPESAS_API_URL = process.env.DESPESAS_API_URL;

// converte Date -> YYYY-MM-DD
function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

// dias de diferença entre duas datas ISO (vencimento - hoje)
function diffDaysISO(dataVencISO, hojeISO) {
  const [a1, m1, d1] = dataVencISO.split("-").map(Number);
  const [a2, m2, d2] = hojeISO.split("-").map(Number);
  const dt1 = new Date(a1, m1 - 1, d1);
  const dt2 = new Date(a2, m2 - 1, d2);
  const diffMs = dt1 - dt2;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Usa tua API:
 * GET /api/v1/despesas?mes=YYYY-MM&empresa=linhagro
 * e filtra pelas regras de tipos_aviso (7,5,3,1,0).
 */
async function buscarDespesasParaAviso(empresa) {
  if (!DESPESAS_API_URL) {
    console.error("DESPESAS_API_URL não configurada. Defina no .env.");
    return [];
  }

  const hoje = new Date();
  const hojeISO = toISODate(hoje);
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const mesParam = `${ano}-${mes}`;

  const url = `${DESPESAS_API_URL}/despesas?mes=${mesParam}&empresa=${empresa}`;
  console.log("Buscando despesas para aviso:", url);

  const resp = await fetch(url);
  if (!resp.ok) {
    console.error("Erro ao buscar despesas da API:", resp.status, await resp.text());
    return [];
  }

  const dados = await resp.json();
  const despesas = dados.despesas || [];

  const candidatas = [];
  for (const d of despesas) {
    const venc = d.data_vencimento;
    if (!venc) continue;

    const vencISO = venc.slice(0, 10);
    const diasDiff = diffDaysISO(vencISO, hojeISO);

    const tiposAviso = Array.isArray(d.tipos_aviso)
      ? d.tipos_aviso
      : Array.isArray(d.tiposAviso)
      ? d.tiposAviso
      : ["3"];

    const chave = String(diasDiff);

    if (["0", "1", "3", "5", "7"].includes(chave) && tiposAviso.includes(chave)) {
      candidatas.push({
        ...d,
        vencimento: vencISO,
        tiposAviso,
        responsaveis: Array.isArray(d.contatos) ? d.contatos : []
      });
    }
  }

  console.log(
    `Encontradas ${candidatas.length} despesas elegíveis para aviso hoje (${empresa}).`
  );
  return candidatas;
}

/**
 * Envia automaticamente para uma empresa específica.
 */
async function enviarAvisosAutomaticosEmpresa(empresa) {
  try {
    const lembretes = await buscarDespesasParaAviso(empresa);
    if (!lembretes.length) {
      console.log(`Nenhum lembrete para enviar automaticamente hoje (${empresa}).`);
      return;
    }

    let enviados = 0;
    const falhas = [];

    console.log(`Iniciando envio automático (${empresa}) para ${lembretes.length} despesa(s).`);

    for (const d of lembretes) {
      const responsaveis = Array.isArray(d.responsaveis) ? d.responsaveis : [];
      if (!responsaveis.length) {
        console.log("Despesa sem responsaveis, ignorando:", d.descricao);
        continue;
      }

      const nomeRespPrincipal = obterNomeResponsavelPrincipal(responsaveis);

      for (const contato of responsaveis) {
        if (!contato || !contato.telefone) {
          console.log("Contato inválido em despesa:", d.descricao, contato);
          falhas.push({
            telefone: contato && contato.telefone,
            nome: contato && contato.nome,
            descricao: d.descricao || "",
            motivo: "Telefone vazio ou contato inválido"
          });
          continue;
        }

        const texto = montarMensagemWhatsApp(d, contato, nomeRespPrincipal, empresa);

        try {
          const resultado = await sendWhatsApp(contato.telefone, texto);

          if (resultado === false || resultado === null) {
            console.error(
              "Falha ao enviar WhatsApp (retorno falso) para",
              contato.telefone,
              "descrição:",
              d.descricao
            );
            falhas.push({
              telefone: contato.telefone,
              nome: contato.nome || "",
              descricao: d.descricao || "",
              motivo: "Envio retornou falso (provável número inválido ou sem 55)"
            });
            continue;
          }

          enviados++;
          console.log(
            "[AUTO] WhatsApp enviado para",
            contato.nome || contato.telefone,
            "descrição:",
            d.descricao,
            "empresa:",
            empresa
          );
        } catch (err) {
          console.error(
            "[AUTO] Erro ao enviar WhatsApp para",
            contato.telefone,
            err.message
          );
          falhas.push({
            telefone: contato.telefone,
            nome: contato.nome || "",
            descricao: d.descricao || "",
            motivo: err.message || "Erro inesperado ao enviar WhatsApp"
          });
        }
      }
    }

    console.log(`[AUTO] Total enviados (${empresa}):`, enviados);
    if (falhas.length) {
      const resumoFalhas = falhas
        .map(f => `${f.nome || "Contato"} (${f.telefone}) - ${f.motivo}`)
        .join(" | ");
      console.log("[AUTO] Falhas:", resumoFalhas);
    }
  } catch (e) {
    console.error(`[AUTO] Erro geral ao enviar avisos automáticos (${empresa}):`, e);
  }
}

// Cron: todo dia às 08:00 (horário do servidor/container)
cron.schedule("0 8 * * *", async () => {
  console.log("=== Job automático 08h iniciado ===");
  await enviarAvisosAutomaticosEmpresa("linhagro");
  // se quiser também Lithoplant:
  // await enviarAvisosAutomaticosEmpresa("lithoplant");
  console.log("=== Job automático 08h concluído ===");
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
