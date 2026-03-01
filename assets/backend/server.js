// server.js
require("dotenv").config();

const express = require("express");
const cron = require("node-cron");
const {
  sendWhatsApp,
  onWhatsAppReady,
  isClientReady
} = require("./whatsapp");
const sql = require("mssql");
const msRestAzure = require("ms-rest-azure");

const app = express();
app.use(express.json());

// flag global de prontidão do WhatsApp (apenas para log)
let whatsappReady = false;

// registra callback do whatsapp.js quando o cliente estiver pronto
if (typeof onWhatsAppReady === "function") {
  onWhatsAppReady(() => {
    console.log("WhatsApp pronto (callback server.js)!");
    whatsappReady = true;
  });
}

// ========== CORS ==========
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.get("/ping", (req, res) => {
  res.send("ok");
});

// Health-check do WhatsApp
app.get("/api/whatsapp/status", async (req, res) => {
  const ready = await isClientReady();
  res.json({
    ready,
    whatsappReadyFlag: whatsappReady,
    timestamp: new Date().toISOString()
  });
});

// ========== DB AZURE SQL (embed) ==========
let poolPromise = null;

async function getAccessToken() {
  const creds = await msRestAzure.loginWithServicePrincipalSecret(
    process.env.AZURE_CLIENT_ID,
    process.env.AZURE_CLIENT_SECRET,
    process.env.AZURE_TENANT_ID,
    { tokenAudience: "https://database.windows.net/" }
  );

  const token = await new Promise((resolve, reject) => {
    creds.getToken((err, res) => {
      if (err) return reject(err);
      resolve(res.accessToken);
    });
  });

  return token;
}

async function getPool() {
  if (!poolPromise) {
    const accessToken = await getAccessToken();

    const config = {
      server: process.env.DB_SERVER,
      authentication: {
        type: "azure-active-directory-access-token",
        options: { token: accessToken }
      },
      options: {
        database: "dwLinhagro",
        encrypt: true
      }
    };

    console.log("Conectando em SQL (WhatsApp):", {
      server: config.server,
      database: config.options.database
    });

    poolPromise = sql.connect(config);
  }

  return poolPromise;
}

// ========== HELPERS MENSAGEM ==========
function gerarSaudacaoComEmoji() {
  const hora = new Date().getHours();
  if (hora < 12) return "☀️ Bom dia";
  if (hora < 18) return "🌤️ Boa tarde";
  return "🌙 Boa noite";
}

function formatarNome(nome) {
  if (!nome) return "";
  const limpo = String(nome).trim().toLowerCase();
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

function obterNomeResponsavelPrincipal(responsaveis) {
  if (!Array.isArray(responsaveis) || !responsaveis.length)
    return "o responsável";
  const resp =
    responsaveis.find(r => r.tipo === "responsavel") || responsaveis[0];
  return formatarNome(resp.nome || "o responsável");
}

// (mantida, se ainda quiser usar em casos de 1 despesa)
function montarMensagemWhatsApp(
  despesa,
  contato,
  nomeResponsavelPrincipal,
  empresa
) {
  const saudacao = gerarSaudacaoComEmoji();
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
      ? `${saudacao}, ${nomeContato}! Tudo bem?\nAqui é da ${nomeEmpresa} passando um lembrete rápido sobre um pagamento em aberto:\n`
      : `${saudacao}, ${nomeContato}! Tudo bem?\nAqui é da ${nomeEmpresa}. ${nomeResponsavelPrincipal} tem um pagamento em aberto e gostaríamos de avisar:\n`;

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

// NOVO: mensagem agrupada (várias despesas em uma mensagem)
function montarMensagemWhatsAppAgrupada(empresa, contato, despesasDoContato) {
  const saudacao = gerarSaudacaoComEmoji();
  const nomeContato = formatarNome(contato.nome || "cliente");
  const nomeEmpresa = empresa === "linhagro" ? "Linhagro" : "Lithoplant";

  const topo =
    `${saudacao}, ${nomeContato}! Tudo bem?\n` +
    `Aqui é da ${nomeEmpresa}. Seguem os pagamentos que vencem *hoje* no seu nome:\n`;

  const linhas = despesasDoContato.map((d, idx) => {
    const desc = d.descricao || "Despesa";
    const dataPtBr = d.vencimento
      ? d.vencimento.split("-").reverse().join("/")
      : "data não informada";

    const valor = d.valor || d.VLRDESDOB || d.vlr || null;
    const valorStr = valor
      ? ` – Valor: R$ ${Number(valor).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`
      : "";

    return `\n${idx + 1}. ${desc}\n   📅 Vencimento: ${dataPtBr}${valorStr}`;
  });

  const rodape =
    "\n\nPedimos, por gentileza, que verifique esses pagamentos assim que possível. 🙏\n" +
    "Se todos já foram realizados, por favor desconsidere esta mensagem.";

  return topo + linhas.join("") + rodape;
}

// ========== ENVIO MANUAL (FRONT) – AGRUPADO ==========
app.post("/api/enviar-lembretes", async (req, res) => {
  const { empresa, usuarioEmail, lembretes } = req.body;

  if (!empresa || !["linhagro", "lithoplant"].includes(empresa)) {
    return res
      .status(400)
      .json({ error: "Empresa inválida ou não informada." });
  }

  if (!Array.isArray(lembretes) || !lembretes.length) {
    return res.status(400).json({ error: "Nenhum lembrete recebido." });
  }

  const ready = await isClientReady();
  if (!ready) {
    return res.status(503).json({
      error:
        "WhatsApp não está conectado no momento. Tente novamente em alguns minutos.",
      enviados: 0,
      envios: [],
      falhas: lembretes.map(d => ({
        telefone: null,
        nome: null,
        descricao: d.descricao || "",
        motivo: "Cliente WhatsApp não conectado"
      }))
    });
  }

  console.log(
    `Recebido para envio (manual): ${lembretes.length} despesa(s), empresa=${empresa}, usuario=${
      usuarioEmail || "-"
    }`
  );

  // Agrupa por telefone
  const mapaContato = new Map(); // chave: telefone, valor: { contato, despesas[] }

  for (const d of lembretes) {
    const responsaveis = Array.isArray(d.responsaveis) ? d.responsaveis : [];
    if (!responsaveis.length) {
      console.log("[MANUAL] Despesa sem responsaveis, ignorando:", d.descricao);
      continue;
    }

    for (const contato of responsaveis) {
      if (!contato || !contato.telefone) {
        console.log(
          "[MANUAL] Contato inválido em despesa:",
          d.descricao,
          contato
        );
        continue;
      }

      const tel = String(contato.telefone).trim();
      if (!tel) continue;

      if (!mapaContato.has(tel)) {
        mapaContato.set(tel, {
          contato,
          despesas: []
        });
      }
      mapaContato.get(tel).despesas.push(d);
    }
  }

  const envios = [];
  const falhas = [];
  let enviados = 0;

  for (const [telefone, item] of mapaContato.entries()) {
    const { contato, despesas } = item;

    const texto = montarMensagemWhatsAppAgrupada(empresa, contato, despesas);

    try {
      const resultado = await sendWhatsApp(telefone, texto);
      if (!resultado) {
        console.error(
          "[MANUAL] Falha ao enviar WhatsApp para",
          telefone,
          "despesas:",
          despesas.map(d => d.descricao).join(" | ")
        );
        falhas.push({
          telefone,
          nome: contato.nome || "",
          descricao: despesas.map(d => d.descricao).join(" | "),
          motivo:
            "Envio retornou falso (provável número inválido ou sem 55)"
        });
        continue;
      }

      enviados++;
      envios.push({
        telefone,
        nome: contato.nome || "",
        quantidadeDespesas: despesas.length,
        descricoes: despesas.map(d => d.descricao),
        empresa
      });

      console.log(
        "[MANUAL] WhatsApp enviado para",
        contato.nome || telefone,
        "com",
        despesas.length,
        "despesa(s), empresa:",
        empresa
      );
    } catch (err) {
      console.error(
        "[MANUAL] Erro ao enviar WhatsApp para",
        telefone,
        err.message
      );
      falhas.push({
        telefone,
        nome: contato.nome || "",
        descricao: despesas.map(d => d.descricao).join(" | "),
        motivo: err.message || "Erro inesperado ao enviar WhatsApp"
      });
    }
  }

  const resumoSucesso = envios
    .map(e => `${e.nome || "Contato"} (${e.telefone})`)
    .join(", ");
  const resumoFalhas = falhas
    .map(
      f => `${f.nome || "Contato"} (${f.telefone}) - ${f.motivo}`
    )
    .join(" | ");

  console.log("[MANUAL] Total de mensagens (agrupadas) enviadas:", enviados);
  if (falhas.length) {
    console.log("[MANUAL] Falhas de envio:", resumoFalhas);
  }

  return res.json({
    enviados,
    envios,
    falhas,
    resumoSucesso,
    resumoFalhas
  });
});

// ========== ENVIO AUTOMÁTICO (CRON) ==========
const EMPRESAS = ["linhagro", "lithoplant"];

function dataISO(d) {
  return d.toISOString().slice(0, 10);
}

function diffDias(dataVencISO, hojeISO) {
  const d1 = new Date(hojeISO + "T00:00:00");
  const d2 = new Date(dataVencISO + "T00:00:00");
  const diffMs = d2.getTime() - d1.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

async function processarEnviosAutomaticos() {
  const hoje = new Date();
  const hojeISO = dataISO(hoje);

  console.log("=== Scheduler(WhatsApp): início execução em", hojeISO, "===");

  const pool = await getPool();

  for (const empresa of EMPRESAS) {
    try {
      console.log(
        `Scheduler(WhatsApp): carregando despesas para empresa=${empresa}`
      );

      // apenas o dia de hoje
      const dataInicio = hojeISO;
      const dataFim = hojeISO;

      const result = await pool
        .request()
        .input("dataInicio", dataInicio)
        .input("dataFim", dataFim)
        .input("empresa", empresa)
        .query(`
          SELECT
            IdDespesa       AS id,
            Empresa         AS empresa,
            Descricao       AS descricao,
            DataVencimento  AS data_vencimento,
            Status          AS status,
            RecorrenciaTipo AS recorrencia_tipo,
            TiposAviso      AS tipos_aviso,
            ContatosJson    AS contatos_json,
            Valor           AS valor
          FROM dbo.dimDespesasVisya
          WHERE DataVencimento BETWEEN @dataInicio AND @dataFim
            AND (@empresa IS NULL OR Empresa = @empresa)
        `);

      const despesas = result.recordset.map(d => {
        const tiposAvisoArr = d.tipos_aviso
          ? String(d.tipos_aviso)
              .split(",")
              .map(x => x.trim())
              .filter(Boolean)
          : ["0"]; // padrão: avisar no dia

        const contatos = d.contatos_json ? JSON.parse(d.contatos_json) : [];
        return {
          id: d.id,
          empresa: d.empresa,
          descricao: d.descricao,
          vencimento: dataISO(new Date(d.data_vencimento)),
          status: d.status,
          recorrente: d.recorrencia_tipo,
          tiposAviso: tiposAvisoArr,
          responsaveis: contatos,
          valor: d.valor
        };
      });

      console.log(
        `Scheduler(WhatsApp): despesas carregadas para ${empresa}:`,
        despesas.length
      );

      if (!despesas.length) continue;

      const lembretesDeHoje = [];

      for (const d of despesas) {
        if (!d.vencimento) continue;
        if (!Array.isArray(d.responsaveis) || !d.responsaveis.length) continue;

        const diff = diffDias(d.vencimento, hojeISO);
        if (diff !== 0) continue; // APENAS no dia do vencimento

        if (!d.tiposAviso.includes("0")) continue;

        console.log(
          `Scheduler(WhatsApp): despesa id=${d.id} empresa=${empresa} elegível (vencimento hoje)`
        );
        lembretesDeHoje.push(d);
      }

      if (!lembretesDeHoje.length) {
        console.log(
          `Scheduler(WhatsApp): nenhuma despesa elegível para envio em ${empresa} hoje.`
        );
        continue;
      }

      console.log(
        `Scheduler(WhatsApp): enviando automaticamente ${lembretesDeHoje.length} despesa(s) para empresa ${empresa}`
      );

      await envioInternoSemHttp({
        empresa,
        usuarioEmail: "scheduler@system",
        lembretes: lembretesDeHoje
      });
    } catch (e) {
      console.error(
        `Scheduler(WhatsApp): erro geral processando empresa=${empresa}:`,
        e
      );
    }
  }

  console.log("=== Scheduler(WhatsApp): fim execução em", hojeISO, "===");
}

// ENVIO AUTOMÁTICO AGRUPADO
async function envioInternoSemHttp({ empresa, usuarioEmail, lembretes }) {
  if (!empresa || !["linhagro", "lithoplant"].includes(empresa)) return;
  if (!Array.isArray(lembretes) || !lembretes.length) return;

  const ready = await isClientReady();
  if (!ready) {
    console.log(
      "[AUTO] WhatsApp não está conectado. Cancelando envios automáticos."
    );
    return;
  }

  console.log(
    `[AUTO] Recebido para envio: ${lembretes.length} despesa(s), empresa=${empresa}, usuario=${usuarioEmail}`
  );

  const mapaContato = new Map(); // chave: telefone, valor: { contato, despesas[] }

  for (const d of lembretes) {
    const responsaveis = Array.isArray(d.responsaveis) ? d.responsaveis : [];
    if (!responsaveis.length) {
      console.log("[AUTO] Despesa sem responsaveis, ignorando:", d.descricao);
      continue;
    }

    for (const contato of responsaveis) {
      if (!contato || !contato.telefone) {
        console.log(
          "[AUTO] Contato inválido em despesa:",
          d.descricao,
          contato
        );
        continue;
      }

      const tel = String(contato.telefone).trim();
      if (!tel) continue;

      if (!mapaContato.has(tel)) {
        mapaContato.set(tel, {
          contato,
          despesas: []
        });
      }
      mapaContato.get(tel).despesas.push(d);
    }
  }

  if (!mapaContato.size) {
    console.log("[AUTO] Nenhum contato elegível após agrupamento.");
    return;
  }

  let enviados = 0;

  for (const [telefone, item] of mapaContato.entries()) {
    const { contato, despesas } = item;

    const texto = montarMensagemWhatsAppAgrupada(empresa, contato, despesas);

    try {
      const resultado = await sendWhatsApp(telefone, texto);
      if (!resultado) {
        console.error(
          "[AUTO] Falha ao enviar WhatsApp para",
          telefone,
          "despesas:",
          despesas.map(d => d.descricao).join(" | ")
        );
        continue;
      }

      enviados++;
      console.log(
        "[AUTO] WhatsApp enviado para",
        contato.nome || telefone,
        "com",
        despesas.length,
        "despesa(s), empresa:",
        empresa
      );
    } catch (err) {
      console.error(
        "[AUTO] Erro ao enviar WhatsApp para",
        telefone,
        err.message
      );
    }
  }

  console.log("[AUTO] Total de mensagens (agrupadas) enviadas:", enviados);
}

// CRON: execução diária às 08:00
cron.schedule("0 8 * * *", async () => {
  console.log("Scheduler(WhatsApp): disparo às 08:00 - checando estado...");

  const ready = await isClientReady();
  if (!ready) {
    console.log(
      "Scheduler(WhatsApp): WhatsApp não está conectado, pulando execução. Verifique autenticação."
    );
    return;
  }

  console.log("Scheduler(WhatsApp): WhatsApp conectado, processando envios...");
  processarEnviosAutomaticos().catch(err =>
    console.error("Scheduler(WhatsApp): erro não tratado:", err)
  );
});

console.log(
  "Scheduler(WhatsApp): agendador iniciado. Execução diária às 08:00."
);

// Porta dinâmica para Azure / container
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);

  setTimeout(async () => {
    const ready = await isClientReady();
    console.log(
      "Status inicial WhatsApp após 30s:",
      ready ? "CONECTADO" : "NÃO CONECTADO"
    );
  }, 30000);
});
