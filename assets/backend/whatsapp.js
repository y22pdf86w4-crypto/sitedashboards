// whatsapp.js
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const path = require("path");

let isReady = false;

// Pasta de sessão (monte como volume persistente no Azure)
const SESSION_FOLDER = path.join(__dirname, ".wwebjsauth");

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "dashboard-bot",      // id fixo para manter a mesma sessão
    dataPath: SESSION_FOLDER        // path que você vai montar no container
  }),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  }
});

// QR para logar na primeira vez
client.on("qr", qr => {
  console.log("QR RECEIVED");
  qrcode.generate(qr, { small: true });
});

// Pronto
client.on("ready", () => {
  isReady = true;
  console.log("WhatsApp pronto!");
});

// Logs básicos de erro
client.on("auth_failure", msg => {
  console.error("Falha de autenticação WhatsApp:", msg);
});

client.on("disconnected", (reason) => {
  isReady = false;
  console.error("WhatsApp desconectado:", reason);
});

client.initialize();

/**
 * Normaliza número e envia mensagem.
 * Aceita:
 *  - "35988283970"
 *  - "5535988283970"
 *  - "35 98828-3970"
 */
async function sendWhatsApp(to, message) {
  if (!isReady) {
    throw new Error("Cliente WhatsApp ainda não está pronto.");
  }

  if (!to) {
    throw new Error("Telefone não informado.");
  }

  let num = to.toString().replace(/\D/g, ""); // só dígitos

  // Se tiver 10 ou 11 dígitos sem DDI, prefixa 55 (Brasil)
  if (!num.startsWith("55")) {
    num = "55" + num;
  }

  // remove zeros extras logo após o DDI, se houver (casos tipo 55035...)
  num = num.replace(/^550+/, "55");

  console.log("Enviando para número normalizado:", num);

  // Confere se o número existe no WhatsApp
  const numberId = await client.getNumberId(num);
  if (!numberId) {
    throw new Error("Número não está no WhatsApp ou formato inválido: " + num);
  }

  return client.sendMessage(numberId._serialized, message);
}

module.exports = { sendWhatsApp };
