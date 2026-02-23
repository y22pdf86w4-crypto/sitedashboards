// db.js
// Conexão com Azure SQL usando Service Principal (Azure AD)

const sql = require('mssql');
const msRestAzure = require('ms-rest-azure');

// cache da promise de pool pra reaproveitar conexão
let poolPromise = null;

// pega um access token do Azure AD (service principal)
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

// cria um novo pool de conexão
async function criarPool() {
  const accessToken = await getAccessToken();

  const config = {
    server: process.env.DB_SERVER, // ex: dwlinhagrosql.database.windows.net
    authentication: {
      type: 'azure-active-directory-access-token',
      options: {
        token: accessToken
      }
    },
    options: {
      // força o banco correto aqui; se preferir, troque por process.env.DB_DATABASE
      database: 'dwLinhagro',
      encrypt: true
    }
  };

  console.log('Conectando em SQL:', {
    server: config.server,
    database: config.options.database
  });

  return sql.connect(config);
}

// retorna (e reutiliza) o pool de conexões
async function getPool() {
  if (!poolPromise) {
    poolPromise = criarPool();
  }

  try {
    return await poolPromise;
  } catch (e) {
    // se o pool quebrar (ex.: token expirado), recria uma vez
    console.error('Erro no pool, recriando conexão:', e.message);
    poolPromise = criarPool();
    return await poolPromise;
  }
}

module.exports = {
  getPool,
  sql
};
