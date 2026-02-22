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

// retorna (e reutiliza) o pool de conexões
async function getPool() {
  if (!poolPromise) {
    const accessToken = await getAccessToken();

    const config = {
      server: process.env.DB_SERVER,           // ex: dwlinhagrosql.database.windows.net
      authentication: {
        type: 'azure-active-directory-access-token',
        options: {
          token: accessToken
        }
      },
      options: {
        database: process.env.DB_DATABASE,     // ex: dwLinhagro
        encrypt: true
      }
    };

    poolPromise = sql.connect(config);
  }

  return poolPromise;
}

module.exports = {
  getPool,
  sql
};
