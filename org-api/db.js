// db.js
// Conexão com Azure SQL usando Service Principal (Azure AD) com renovação de token

require('dotenv').config();
const sql = require('mssql');
const msRestAzure = require('ms-rest-azure');

let poolPromise = null;

// ======== TOKEN AZURE AD ========

async function getAccessToken() {
  const creds = await msRestAzure.loginWithServicePrincipalSecret(
    process.env.AZURE_CLIENT_ID,
    process.env.AZURE_CLIENT_SECRET,
    process.env.AZURE_TENANT_ID,
    { tokenAudience: 'https://database.windows.net/' }
  );

  const token = await new Promise((resolve, reject) => {
    creds.getToken((err, res) => {
      if (err) return reject(err);
      resolve(res.accessToken);
    });
  });

  return token;
}

// ======== CRIAÇÃO DO POOL (sempre com token novo) ========

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
      encrypt: true
    }
  };

  console.log('Conectando em SQL:', {
    server: config.server,
    database: config.options.database
  });

  const pool = await sql.connect(config);

  // Log básico de erro de pool (ex.: perda de conexão)
  pool.on('error', err => {
    console.error('Erro no pool SQL:', err);
    // Se der erro aqui, força recriação na próxima chamada
    poolPromise = null;
  });

  return pool;
}

// ======== OBTENÇÃO DO POOL (com retry) ========

async function getPool() {
  if (!poolPromise) {
    poolPromise = criarPool();
  }

  try {
    return await poolPromise;
  } catch (e) {
    console.error('Erro ao obter pool, recriando conexão:', e.message);
    // força um novo token + novo pool
    poolPromise = criarPool();
    return await poolPromise;
  }
}

// ======== HELPER DE QUERY COM TRATAMENTO DE ELOGIN ========

/**
 * Executa uma query usando o pool atual.
 * Se ocorrer erro de login/token expirado (ELOGIN), recria o pool e tenta 1 vez de novo.
 * 
 * @param {string} query - T-SQL a executar
 * @param {function(sql.Request): void} configureRequest - opcional, para adicionar parâmetros etc.
 * @returns {Promise<sql.IResult<any>>}
 */
async function runQuery(query, configureRequest) {
  let pool = await getPool();

  try {
    const request = pool.request();
    if (typeof configureRequest === 'function') {
      configureRequest(request);
    }
    return await request.query(query);
  } catch (err) {
    // Se o problema for token expirado / login, recria pool e tenta de novo
    if (err && err.code === 'ELOGIN') {
      console.error('ELOGIN detectado (token expirado). Recriando pool e tentando novamente...');
      poolPromise = null;
      pool = await getPool();

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
  runQuery,
  sql
};
