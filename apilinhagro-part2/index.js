require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { getPoolWithRetry, runQuery, sql } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

/* ================== PING ================== */

app.get('/api/v1/ping', (req, res) => {
  res.json({ ok: true });
});

/* ================== TEST-DB ================== */

app.get('/api/v1/test-db', async (req, res) => {
  try {
    const pool = await getPoolWithRetry();
    const result = await pool.request().query(`
      SELECT 
        DB_NAME() AS CurrentDB,
        SCHEMA_NAME() AS CurrentSchema
    `);
    res.json(result.recordset[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error', detail: e.message });
  }
});

/* ================== CLIENTES (teste de conexão real) ================== */

app.get('/api/v1/clientes', async (req, res) => {
  try {
    const nomeFiltro = (req.query.nome || '').trim();

    const sqlBase = `
      SELECT DISTINCT
        p.ParceiroCodigo         AS codigo,
        p.ParceiroNome           AS nome,
        p.ParceiroCidade         AS cidade,
        p.ParceiroUFSigla        AS uf
      FROM dbo.dimParceiroSkw p
      INNER JOIN dbo.fatVendas f
        ON f.ParceiroCodigo = p.ParceiroCodigo
       AND f.DataVenda >= DATEADD(YEAR, -3, CAST(GETDATE() AS date))
      WHERE p.ParceiroCodigo <> 0
    `;

    const sqlQuery = nomeFiltro
      ? sqlBase + ' AND p.ParceiroNome LIKE @nome ORDER BY p.ParceiroNome;'
      : sqlBase + ' ORDER BY p.ParceiroNome;';

    const result = await runQuery(sqlQuery, request => {
      if (nomeFiltro) {
        request.input('nome', `%${nomeFiltro}%`);
      }
    });

    res.json({ total: result.recordset.length, clientes: result.recordset });
  } catch (e) {
    console.error('Erro GET /api/v1/clientes:', e);
    res
      .status(500)
      .json({ error: 'Erro ao buscar clientes', detail: e.message });
  }
});

/* ================== PREÇOS PRODUTO ================== */
/*
   SELECT TOP (1000)
         [ID_TABELA_PRECO]
        ,[CODIGO_TABELA]
        ,[DATA_VIGENCIA]
        ,[CODIGO_PRODUTO]
        ,[DESCRICAO_PRODUTO]
        ,[CODIGO_LOCAL]
        ,[CONTROLE]
        ,[PRECO_VENDA]
   FROM [dbo].[dimPrecoProdutoSkw]
   -- filtros: produto (CODIGO_PRODUTO), tabela (CODIGO_TABELA), descricao (DESCRICAO_PRODUTO)
*/

app.get('/api/v1/precos', async (req, res) => {
  try {
    const { produto, tabela, descricao } = req.query;

    let sqlQuery = `
      SELECT TOP (1000)
        ID_TABELA_PRECO      AS idTabelaPreco,
        CODIGO_TABELA        AS codigoTabela,
        DATA_VIGENCIA        AS dataVigencia,
        CODIGO_PRODUTO       AS codigoProduto,
        DESCRICAO_PRODUTO    AS descricaoProduto,
        CODIGO_LOCAL         AS codigoLocal,
        CONTROLE             AS controle,
        PRECO_VENDA          AS precoVenda
      FROM dbo.dimPrecoProdutoSkw
      WHERE 1 = 1
    `;

    const bind = request => {
      if (produto) {
        sqlQuery += ' AND CODIGO_PRODUTO = @produto';
        request.input('produto', produto);
      }
      if (tabela) {
        sqlQuery += ' AND CODIGO_TABELA = @tabela';
        request.input('tabela', tabela);
      }
      if (descricao) {
        sqlQuery += ' AND DESCRICAO_PRODUTO LIKE @descricao';
        request.input('descricao', `%${descricao}%`);
      }
    };

    sqlQuery += ' ORDER BY DESCRICAO_PRODUTO;';

    const result = await runQuery(sqlQuery, bind);

    res.json({
      total: result.recordset.length,
      precos: result.recordset
    });
  } catch (e) {
    console.error('Erro GET /api/v1/precos:', e);
    res.status(500).json({
      error: 'Erro ao buscar preços',
      detail: e.message
    });
  }
});

/* ================== HEALTH ================== */

app.get('/api/v1/health', async (req, res) => {
  const status = {};

  status.ping = 'ok';

  try {
    const pool = await getPoolWithRetry();
    const r = await pool.request().query(`
      SELECT TOP 1 DB_NAME() AS db FROM sys.objects
    `);
    status.db = r.recordset.length > 0 ? 'ok' : 'sem dados';
  } catch (e) {
    status.db = 'erro: ' + e.message;
  }

  try {
    const r = await runQuery(
      `SELECT TOP 1 p.ParceiroCodigo FROM dbo.dimParceiroSkw p
       INNER JOIN dbo.fatVendas f ON f.ParceiroCodigo = p.ParceiroCodigo
       WHERE p.ParceiroCodigo <> 0;`,
      () => {}
    );
    status.clientes = r.recordset.length > 0 ? 'ok' : 'sem dados';
  } catch (e) {
    status.clientes = 'erro: ' + e.message;
  }

  const tudoOk = Object.values(status).every(
    v => typeof v === 'string' && v.startsWith('ok')
  );

  res.status(tudoOk ? 200 : 207).json({
    status: tudoOk ? 'ok' : 'parcial',
    checks: status
  });
});

/* ================== START ================== */

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('API rodando na porta ' + port));
