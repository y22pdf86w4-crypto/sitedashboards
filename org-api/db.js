// db.js
// Conexão com Azure SQL usando Service Principal (Azure AD) + renovação de token + recriação de pool

require('dotenv').config();
const sql = require('mssql');
const { ClientSecretCredential } = require('@azure/identity');

// Credencial do Service Principal
const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID,
  process.env.AZURE_CLIENT_ID,
  process.env.AZURE_CLIENT_SECRET
);

let poolPromise = null;
let currentToken = null;
let tokenExpiresOn = 0;

// Quanto tempo antes do vencimento vamos forçar renovação (ms)
const TOKEN_EARLY_REFRESH_MS = 5 * 60 * 1000; // 5 minutos

// ======== TOKEN AZURE AD (via @azure/identity) ========

async function getAccessToken() {
  // Se ainda temos token válido por mais de 5 min, reaproveita
  const now = Date.now();
  if (currentToken && tokenExpiresOn - now > TOKEN_EARLY_REFRESH_MS) {
    return currentToken;
  }

  const tokenResponse = await credential.getToken('https://database.windows.net/.default');
  if (!tokenResponse || !tokenResponse.token) {
    throw new Error('Falha ao obter access token do Azure AD');
  }

  currentToken = tokenResponse.token;
  tokenExpiresOn = tokenResponse.expiresOnTimestamp || (now + 60 * 60 * 1000); // fallback 1h

  return currentToken;
}

// ======== CRIAÇÃO DO POOL (sempre com token novo) ========

async function criarPool() {
  // Garante sempre token fresco para este pool
  const accessToken = await getAccessToken();

  const config = {
    server: process.env.DB_SERVER,
    authentication: {
      type: 'azure-active-directory-access-token',
      options: {
        token: accessToken
      }
    },
    options: {
      database: process.env.DB_DATABASE || 'dwLinhagro',
      encrypt: true,
      trustServerCertificate: false
    }
  };

  console.log('Conectando em SQL:', {
    server: config.server,
    database: config.options.database
  });

  const pool = await sql.connect(config);

  // Log básico de erro de pool (ex.: perda de conexão / token expirado em conexões internas)
  pool.on('error', async err => {
    console.error('Erro no pool SQL:', err);
    try {
      await sql.close(); // fecha pool global antigo
    } catch (_) {}
    poolPromise = null;
  });

  return pool;
}

// ======== OBTENÇÃO DO POOL (com retry de criação) ========

async function getPool() {
  // Se token está perto de expirar, derruba pool e força recriação
  const now = Date.now();
  if (tokenExpiresOn && tokenExpiresOn - now <= TOKEN_EARLY_REFRESH_MS) {
    console.warn('Token perto de expirar, fechando pool e renovando token...');
    try {
      await sql.close();
    } catch (_) {}
    poolPromise = null;
  }

  if (!poolPromise) {
    poolPromise = criarPool();
  }

  try {
    return await poolPromise;
  } catch (e) {
    console.error('Erro ao obter pool, recriando conexão:', e.message);
    try {
      await sql.close();
    } catch (_) {}
    poolPromise = criarPool();
    return await poolPromise;
  }
}

// Helper: obtém pool com retry especial para ELOGIN na criação
async function getPoolWithRetry() {
  try {
    return await getPool();
  } catch (e) {
    if (e && e.code === 'ELOGIN') {
      console.error('ELOGIN ao obter pool. Fechando e recriando...');
      try {
        await sql.close();
      } catch (_) {}
      poolPromise = null;
      currentToken = null;
      tokenExpiresOn = 0;
      return await getPool();
    }
    throw e;
  }
}

// ======== HELPER DE QUERY COM TRATAMENTO DE ELOGIN ========

/**
 * Executa uma query usando o pool atual.
 * Se ocorrer erro de login/token expirado (ELOGIN), fecha pool, renova token e tenta 1 vez de novo.
 *
 * @param {string} query - T-SQL a executar
 * @param {function(sql.Request): void} configureRequest - opcional, para adicionar parâmetros etc.
 * @returns {Promise<sql.IResult<any>>}
 */
async function runQuery(query, configureRequest) {
  let pool = await getPoolWithRetry();

  try {
    const request = pool.request();
    if (typeof configureRequest === 'function') {
      configureRequest(request);
    }
    return await request.query(query);
  } catch (err) {
    // Se o problema for token expirado / login, recria pool e tenta de novo
    if (err && err.code === 'ELOGIN') {
      console.error('ELOGIN detectado (query). Fechando pool, renovando token e tentando novamente...');
      try {
        await sql.close();
      } catch (_) {}

      poolPromise = null;
      currentToken = null;
      tokenExpiresOn = 0;

      pool = await getPoolWithRetry();

      const request2 = pool.request();
      if (typeof configureRequest === 'function') {
        configureRequest(request2);
      }
      return await request2.query(query);
    }

    // Outros erros sobem para o caller
    throw err;
  }
}

module.exports = {
  getPool,
  getPoolWithRetry,
  runQuery,
  sql
};
