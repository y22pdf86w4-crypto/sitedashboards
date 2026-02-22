const express = require("express");
const { sendWhatsApp } = require("./whatsapp");
const app = express();

app.use(express.json());

// CORS – em cloud, libera pelo menos o seu domínio público
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";

  // ajuste aqui depois para o domínio real do front
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

// saudação dinâmica
function gerarSaudacao() {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

// nome com primeira letra maiúscula
function formatarNome(nome) {
  if (!nome) return "";
  const limpo = String(nome).trim().toLowerCase();
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

// nome responsável principal
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

// Porta dinâmica para Azure / container
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
