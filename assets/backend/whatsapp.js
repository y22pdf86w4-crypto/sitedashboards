// whatsapp.js
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const path = require("path");

// Flag interna de prontidão e callbacks pendentes
let isReady = false;
let readyCallbacks = [];

// Pasta de sessão (monte como volume persistente no Azure / container)
const SESSION_FOLDER = path.join(__dirname, ".wwebjsauth");

// Instância do cliente WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "dashboard-bot", // id fixo para manter a mesma sessão
    dataPath: SESSION_FOLDER   // path que você vai montar no container
  }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu"
    ]
  }
});

// QR para logar na primeira vez
client.on("qr", qr => {
  console.log("QR RECEIVED - escaneie para autenticar:");
  qrcode.generate(qr, { small: true });
});

// Autenticação
client.on("authenticated", () => {
  console.log("WhatsApp autenticado com sucesso!");
});

// Pronto
client.on("ready", () => {
  isReady = true;
  console.log("WhatsApp pronto e conectado!");

  // dispara callbacks registrados pelo server.js
  readyCallbacks.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.error("Erro em callback onWhatsAppReady:", e);
    }
  });
  readyCallbacks = [];
});

// Falha de autenticação
client.on("auth_failure", msg => {
  isReady = false;
  console.error("Falha de autenticação WhatsApp:", msg);
});

// Desconectado
client.on("disconnected", reason => {
  isReady = false;
  console.error("WhatsApp desconectado:", reason);
});

// Mudança de estado (CONNECTED, DISCONNECTED, etc.)
client.on("change_state", state => {
  console.log("WhatsApp estado mudou para:", state);
  if (state !== "CONNECTED") {
    isReady = false;
  }
});

/**
 * Inicialização com retry para mitigar "Execution context was destroyed"
 */
async function initializeWithRetry(maxRetries = 3, delayMs = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `Tentativa ${attempt}/${maxRetries} de inicializar WhatsApp...`
      );
      await client.initialize();
      return;
    } catch (error) {
      console.error(`Erro na tentativa ${attempt}:`, error.message);

      if (error.message.includes("Execution context was destroyed")) {
        console.log(`Aguardando ${delayMs}ms antes de tentar novamente...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));

        if (attempt === maxRetries) {
          console.error("Falha ao inicializar após múltiplas tentativas.");
          throw error;
        }
      } else {
        throw error;
      }
    }
  }
}

// Chama inicialização com retry
initializeWithRetry().catch(err => {
  console.error("Erro crítico ao inicializar WhatsApp:", err);
  // process.exit(1);
});

/**
 * Registrar callback para quando o WhatsApp estiver pronto.
 */
function onWhatsAppReady(cb) {
  if (typeof cb === "function") {
    if (isReady) {
      try {
        cb();
      } catch (e) {
        console.error("Erro em callback onWhatsAppReady imediato:", e);
      }
    } else {
      readyCallbacks.push(cb);
    }
  }
}

/**
 * Verifica estado atual da conexão de forma robusta.
 */
async function isClientReady() {
  if (!isReady) return false;

  try {
    const state = await client.getState(); // ex: "CONNECTED"
    const ok = state === "CONNECTED";
    if (!ok) {
      console.log("isClientReady: estado atual não é CONNECTED:", state);
    }
    return ok;
  } catch (error) {
    console.error("Erro ao verificar estado do cliente:", error);
    return false;
  }
}

/**
 * Normaliza número e envia mensagem.
 */
async function sendWhatsApp(to, message) {
  const clientReady = await isClientReady();
  if (!clientReady) {
    throw new Error(
      "Cliente WhatsApp não está conectado. Estado atual não é CONNECTED."
    );
  }

  if (!to) {
    throw new Error("Telefone não informado.");
  }

  let num = to.toString().replace(/\D/g, ""); // só dígitos

  if (!num.startsWith("55")) {
    num = "55" + num;
  }

  // remove zeros extras logo após o DDI, se houver
  num = num.replace(/^550+/, "55");

  console.log("Enviando para número normalizado:", num);

  const numberId = await client.getNumberId(num);
  if (!numberId) {
    throw new Error("Número não está no WhatsApp ou formato inválido: " + num);
  }

  return client.sendMessage(numberId._serialized, message);
}

module.exports = { sendWhatsApp, onWhatsAppReady, isClientReady };
