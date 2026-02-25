// db.js - VERSÃO CORRIGIDA
require('dotenv').config();
const sql = require('mssql');
const msRestAzure = require('ms-rest-azure');

let poolPromise = null;
let tokenCache = {
  token: null,
  expiresAt: null
};

async function getAccessToken() {
  const now = Date.now();
  
  // Renova se não existe ou vai expirar em menos de 5 minutos (300000ms)
  if (!tokenCache.token || !tokenCache.expiresAt || (tokenCache.expiresAt - now) < 300000) {
    console.log('[DB] Renovando token Azure AD...');
    
    const creds = await msRestAzure.loginWithServicePrincipalSecret(
      process.env.AZURE_CLIENT_ID,
      process.env.AZURE_CLIENT_SECRET,
      process.env.AZURE_TENANT_ID,
      { tokenAudience: 'https://database.windows.net/' }
    );

    const tokenResponse = await new Promise((resolve, reject) => {
      creds.getToken((err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });

    // Tokens do Azure AD duram 1 hora (3600 segundos)
    // Guarda expiresOn ou calcula 55 minutos a partir de agora
    const expiresInMs = tokenResponse.expiresIn 
      ? tokenResponse.expiresIn * 1000 
      : 55 * 60 * 1000; // 55 minutos como fallback
    
    tokenCache = {
      token: tokenResponse.accessToken,
      expiresAt: now + expiresInMs
    };

    console.log('[DB] Token renovado. Expira em:', new Date(tokenCache.expiresAt).toISOString());
  }

  return tokenCache.token;
}

async function criarPool() {
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
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30 * 60 * 1000, // 30 minutos
      acquireTimeoutMillis: 30000
    },
    connectionTimeout: 30000,
    requestTimeout: 60000
  };

  console.log('[DB] Conectando em SQL:', {
    server: config.server,
    database: config.options.database
  });

  return sql.connect(config);
}

async function getPool() {
  // Verifica se o token está próximo de expirar
  const now = Date.now();
  const tokenProximoExpiracao = tokenCache.expiresAt && (tokenCache.expiresAt - now) < 300000;

  // Se token vai expirar em breve, força recriação do pool
  if (tokenProximoExpiracao && poolPromise) {
    console.log('[DB] Token próximo de expirar, recriando pool...');
    try {
      const pool = await poolPromise;
      await pool.close();
    } catch (e) {
      console.error('[DB] Erro ao fechar pool antigo:', e.message);
    }
    poolPromise = null;
  }

  if (!poolPromise) {
    poolPromise = criarPool();
  }

  try {
    return await poolPromise;
  } catch (e) {
    console.error('[DB] Erro no pool, recriando conexão:', e.message);
    
    // Limpa cache de token se erro de autenticação
    if (e.message.includes('Token is expired') || e.code === 'ELOGIN') {
      console.log('[DB] Limpando cache de token...');
      tokenCache = { token: null, expiresAt: null };
    }
    
    poolPromise = null;
    poolPromise = criarPool();
    return await poolPromise;
  }
}

// Opcional: Função para fechar pool gracefully
async function closePool() {
  if (poolPromise) {
    try {
      const pool = await poolPromise;
      await pool.close();
      console.log('[DB] Pool fechado');
    } catch (e) {
      console.error('[DB] Erro ao fechar pool:', e.message);
    }
    poolPromise = null;
  }
}

module.exports = {
  getPool,
  closePool,
  sql
};
