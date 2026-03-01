require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { getPoolWithRetry, runQuery, sql } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

/* ========= HELPERS DE AUDITORIA ========= */

function getUsuarioFromReq(req) {
  return (req.headers['x-usuario-email'] || '').toString();
}

async function logDespesa(
  pool,
  { operacao, usuarioEmail, idDespesa, empresa, antes, depois, detalhes }
) {
  try {
    const reqSql = pool
      .request()
      .input('Operacao', operacao)
      .input('UsuarioEmail', usuarioEmail || 'desconhecido')
      .input('IdDespesa', idDespesa || null)
      .input('Empresa', empresa || null)
      .input('AntesJson', antes ? JSON.stringify(antes) : null)
      .input('DepoisJson', depois ? JSON.stringify(depois) : null)
      .input('DetalhesJson', detalhes ? JSON.stringify(detalhes) : null);

    await reqSql.query(`
      INSERT INTO dbo.dimlogDespesasVisya
        (Operacao, UsuarioEmail, IdDespesa, Empresa, AntesJson, DepoisJson, DetalhesJson)
      VALUES
        (@Operacao, @UsuarioEmail, @IdDespesa, @Empresa, @AntesJson, @DepoisJson, @DetalhesJson);
    `);
  } catch (e) {
    console.error('Falha ao gravar dimlogDespesasVisya:', e.message);
  }
}

async function logAuditGenerico(
  pool,
  { entidade, entidadeId, acao, usuarioEmail, empresa, detalhes }
) {
  try {
    const reqSql = pool
      .request()
      .input('entidade', entidade)
      .input('entidade_id', entidadeId || null)
      .input('acao', acao)
      .input('usuario', usuarioEmail || 'desconhecido')
      .input('empresa', empresa || null)
      .input('detalhes', detalhes ? JSON.stringify(detalhes) : null);

    await reqSql.query(`
      INSERT INTO dbo.dimAudit_log
        (entidade, entidade_id, acao, usuario, empresa, detalhes)
      VALUES
        (@entidade, @entidade_id, @acao, @usuario, @empresa, @detalhes);
    `);
  } catch (e) {
    console.error('Falha ao gravar dimAudit_log:', e.message);
  }
}

/* ================== TESTES SIMPLES ================== */

app.get('/api/v1/ping', (req, res) => {
  res.json({ ok: true });
});

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

/* ================== ROTA DE GEOCODING (GOOGLE) ================== */

const GOOGLE_KEY = process.env.GEOCODING;

app.get('/api/v1/geocode', async (req, res) => {
  const endereco = req.query.q;
  if (!endereco) {
    return res.status(400).json({ error: 'Parâmetro q é obrigatório' });
  }

  if (!GOOGLE_KEY) {
    return res
      .status(500)
      .json({ error: 'GEOCODING key não configurada no .env' });
  }

  const original = String(endereco).trim();
  console.log('[GEOCODE] Endereço:', original);

  try {
    const base = 'https://maps.googleapis.com/maps/api/geocode/json';
    const params = new URLSearchParams({
      address: original + ', Brasil',
      key: GOOGLE_KEY
    });

    const url = `${base}?${params.toString()}`;
    console.log('[GEOCODE] Google URL:', url);

    const resp = await fetch(url);
    console.log('[GEOCODE] HTTP status Google:', resp.status);

    if (!resp.ok) {
      return res.status(502).json({
        error: 'Erro HTTP no Google Geocoding',
        status: resp.status
      });
    }

    const data = await resp.json();
    console.log('[GEOCODE] Google status:', data.status);

    if (data.status !== 'OK' || !data.results || !data.results.length) {
      return res.status(404).json({
        error: 'Nenhum resultado para o endereço',
        google_status: data.status
      });
    }

    const loc = data.results[0].geometry.location;
    const lat = loc.lat;
    const lng = loc.lng;

    console.log('[GEOCODE] Sucesso:', { lat, lng });

    return res.json({
      provider: 'google',
      lat,
      lng
    });
  } catch (e) {
    console.error('[GEOCODE] Erro geral:', e);
    return res
      .status(500)
      .json({ error: 'Erro interno no geocode', detail: e.message });
  }
});

/* ================== TOMTOM TRAFFIC INCIDENTS (PROXY) ================== */

const TOMTOM_KEY = process.env.TOMTOM_TRAFFIC_KEY;

app.get('/api/v1/logistica/tomtom/incidentes', async (req, res) => {
  try {
    if (!TOMTOM_KEY) {
      console.error('[TOMTOM INCIDENTS] TOMTOM_TRAFFIC_KEY não configurada');
      return res
        .status(500)
        .json({ error: 'TOMTOM_TRAFFIC_KEY não configurada no .env' });
    }

    let bboxStr = (req.query.bbox || '').toString().trim();
    console.log('[TOMTOM INCIDENTS] bbox recebido:', bboxStr);

    if (!bboxStr) {
      return res.status(400).json({ error: 'Parâmetro bbox é obrigatório' });
    }

    const parts = bboxStr.split(',').map(x => parseFloat(x.trim()));
    if (parts.length !== 4 || parts.some(x => Number.isNaN(x))) {
      console.error('[TOMTOM INCIDENTS] bbox inválido:', bboxStr, parts);
      return res.status(400).json({ error: 'Parâmetro bbox inválido' });
    }

    let [minLon, minLat, maxLon, maxLat] = parts;

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;

    const HALF_DEG_LAT = 0.1;
    const HALF_DEG_LON = 0.1;

    minLat = centerLat - HALF_DEG_LAT;
    maxLat = centerLat + HALF_DEG_LAT;
    minLon = centerLon - HALF_DEG_LON;
    maxLon = centerLon + HALF_DEG_LON;

    const clampedBbox = `${minLon},${minLat},${maxLon},${maxLat}`;
    console.log('[TOMTOM INCIDENTS] bbox clampado:', clampedBbox);

    const baseUrl = 'https://api.tomtom.com/traffic/services/5/incidentDetails';

    const params = new URLSearchParams({
      key: TOMTOM_KEY,
      bbox: clampedBbox,
      fields:
        '{incidents{type,geometry{type,coordinates},properties{iconCategory,events{description}}}}',
      language: 'en-GB',
      timeValidityFilter: 'present'
    });

    const url = `${baseUrl}?${params.toString()}`;
    console.log('[TOMTOM INCIDENTS] URL final:', url);

    let resp;
    try {
      resp = await fetch(url);
    } catch (err) {
      console.error('[TOMTOM INCIDENTS] Erro de rede no fetch:', err);
      return res.status(502).json({
        error: 'Falha de rede ao chamar TomTom',
        detail: err.message || String(err)
      });
    }

    console.log('[TOMTOM INCIDENTS] HTTP status TomTom:', resp.status);

    let text = '';
    try {
      text = await resp.text();
    } catch (err) {
      console.error('[TOMTOM INCIDENTS] Erro ao ler body:', err);
    }

    if (!resp.ok) {
      console.error('[TOMTOM INCIDENTS] body erro TomTom:', text);
      return res.status(502).json({
        error: 'Erro HTTP na TomTom IncidentDetails',
        status: resp.status,
        body: text
      });
    }

    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (err) {
      console.error(
        '[TOMTOM INCIDENTS] Erro ao parsear JSON:',
        err,
        'body=',
        text
      );
      return res.status(502).json({
        error: 'Resposta inválida da TomTom',
        detail: err.message || String(err),
        body: text
      });
    }

    return res.json(data);
  } catch (e) {
    console.error('[TOMTOM INCIDENTS] Erro geral:', e);
    return res.status(500).json({
      error: 'Erro interno ao consultar incidentes TomTom',
      detail: e.message || String(e)
    });
  }
});

/* ================== CLIENTES LOGÍSTICA ================== */

app.get('/api/v1/logistica/clientes', async (req, res) => {
  try {
    const nomeFiltro = (req.query.nome || '').trim();

    const sqlBase = `
      SELECT DISTINCT
        p.ParceiroCodigo        AS codigo,
        p.ParceiroNome          AS nome,
        p.ParceiroLogradouro    AS logradouro,
        ISNULL(p.ParceiroEnderecoNumero, 0) AS numero,
        p.ParceiroBairro        AS bairro,
        p.ParceiroCidade        AS cidade,
        p.ParceiroUFSigla       AS uf,
        p.ParceiroCEP           AS cep,
        p.ParceiroLatitude      AS lat,
        p.ParceiroLongitude     AS lng
      FROM dbo.dimParceiroSkw p
      INNER JOIN dbo.fatVendas f
        ON f.ParceiroCodigo = p.ParceiroCodigo
       AND f.DataVenda >= DATEADD(YEAR, -3, CAST(GETDATE() AS date))
      WHERE p.ParceiroCodigo <> 0
    `;

    const sqlQuery = nomeFiltro
      ? sqlBase + ' AND p.ParceiroNome LIKE @nome ORDER BY p.ParceiroNome;'
      : sqlBase + ' ORDER BY p.ParceiroNome;';

    console.log('[SQL CLIENTES] sqlQuery=', sqlQuery);

    const result = await runQuery(sqlQuery, request => {
      if (nomeFiltro) {
        request.input('nome', `%${nomeFiltro}%`);
      }
    });

    const clientes = result.recordset.map(r => {
      const nomeLimpo = (r.nome || '')
        .replace(/\s+/g, ' ')
        .replace(/^\d+\s*-\s*[\d\.\,]+\s*/i, '')
        .trim();

      const enderecoPartes = [
        r.logradouro && String(r.logradouro).trim(),
        r.numero && String(r.numero).trim(),
        r.bairro && `Bairro ${String(r.bairro).trim()}`,
        r.cidade && String(r.cidade).trim(),
        r.uf && String(r.uf).trim(),
        r.cep && String(r.cep).trim()
      ].filter(Boolean);

      const latNum =
        r.lat !== null && !isNaN(parseFloat(r.lat))
          ? parseFloat(r.lat)
          : null;
      const lngNum =
        r.lng !== null && !isNaN(parseFloat(r.lng))
          ? parseFloat(r.lng)
          : null;

      return {
        id: r.codigo,
        codigo: r.codigo,
        nome: nomeLimpo || '<SEM NOME>',
        endereco:
          enderecoPartes.length > 0
            ? enderecoPartes.join(', ')
            : '<SEM ENDERECO>',
        lat: latNum,
        lng: lngNum
      };
    });

    res.json({ clientes });
  } catch (e) {
    console.error('Erro GET /api/v1/logistica/clientes:', e);
    res
      .status(500)
      .json({ error: 'Erro ao buscar clientes', detail: e.message });
  }
});

/* ================== VENDEDORES ================== */

app.get('/api/v1/vendedores', async (req, res) => {
  try {
    const nomeFiltro = (req.query.nome || '').trim();

    const sqlWrapped = `
      SELECT
        MIN(codvend)   AS codvend,
        nome_unificado AS nome_vendedor,
        COUNT(DISTINCT codparc) AS QtdeClientes
      FROM (
        SELECT
          c.CODVEND AS codvend,
          c.CODPARC AS codparc,
          CASE
            WHEN c.CODVEND IN (148, 128)           THEN 'JANDIERRE SANTOS BRAGA'
            WHEN c.CODVEND IN (163, 171)           THEN 'BERSONN NESTAN'
            WHEN c.CODVEND IN (15, 51)             THEN 'JOSE VICENTE'
            WHEN c.CODVEND = 2                     THEN 'ALTEMIR POLEZE'
            WHEN c.CODVEND IN (22, 61)             THEN 'LITHO'
            ELSE c.NOME_VENDEDOR
          END AS nome_unificado
        FROM dbo.dimCarteiraSKW c
        WHERE c.CODVEND IS NOT NULL
          AND c.CODVEND <> 0
      ) v
      ${nomeFiltro ? 'WHERE v.nome_unificado LIKE @nome' : ''}
      GROUP BY nome_unificado
      ORDER BY nome_unificado;
    `;

    const result = await runQuery(sqlWrapped, request => {
      if (nomeFiltro) {
        request.input('nome', `%${nomeFiltro}%`);
      }
    });

    const vendedores = result.recordset.map(r => ({
      codvend: r.codvend,
      nome_vendedor: r.nome_vendedor,
      qtde_clientes: r.QtdeClientes,
      cargo: null,
      codparc: null
    }));

    res.json({ vendedores });
  } catch (e) {
    console.error('Erro GET /api/v1/vendedores:', e);
    res
      .status(500)
      .json({ error: 'Erro ao buscar vendedores', detail: e.message });
  }
});

/* ================== CARTEIRA POR VENDEDOR ================== */

app.get('/api/v1/carteira', async (req, res) => {
  try {
    const codvend = parseInt(req.query.codvend, 10);

    if (!codvend || Number.isNaN(codvend)) {
      return res.status(400).json({
        error: 'Parâmetro "codvend" é obrigatório e deve ser numérico.'
      });
    }

    const sqlQuery = `
      WITH CTE AS (
        SELECT
          c.CODVEND       AS codvend,
          c.NOME_VENDEDOR AS nome_vendedor,
          c.CODPARC       AS codparc,
          c.NOME_CLIENTE  AS nome_cliente,
          c.CODEMP        AS codemp,
          c.DTLIM         AS dtlim,
          c.LIMCRED       AS limcred,
          p.ParceiroLogradouro             AS logradouro,
          ISNULL(p.ParceiroEnderecoNumero, 0) AS numero,
          p.ParceiroBairro                 AS bairro,
          p.ParceiroCidade                 AS cidade,
          p.ParceiroUFSigla                AS uf,
          p.ParceiroCEP                    AS cep,
          p.ParceiroLatitude               AS lat,
          p.ParceiroLongitude              AS lng,
          ROW_NUMBER() OVER (
            PARTITION BY c.CODVEND, c.CODPARC
            ORDER BY c.DTLIM DESC, c.CODEMP DESC
          ) AS rn
        FROM dbo.dimCarteiraSKW c
        LEFT JOIN dbo.dimParceiroSkw p
               ON p.ParceiroCodigo = c.CODPARC
        WHERE
          (
            (@codvend = 148 AND c.CODVEND IN (148, 128)) OR
            (@codvend = 128 AND c.CODVEND IN (148, 128)) OR
            (@codvend = 163 AND c.CODVEND IN (163, 171)) OR
            (@codvend = 171 AND c.CODVEND IN (163, 171)) OR
            (@codvend = 15  AND c.CODVEND IN (15, 51)) OR
            (@codvend = 51  AND c.CODVEND IN (15, 51)) OR
            (@codvend = 2   AND c.CODVEND = 2) OR
            (@codvend = 22  AND c.CODVEND IN (22, 61)) OR
            (@codvend = 61  AND c.CODVEND IN (22, 61)) OR
            (
              c.CODVEND NOT IN (148,128,163,171,15,51,2,22,61)
              AND c.CODVEND = @codvend
            )
          )
      )
      SELECT
        codvend,
        nome_vendedor,
        codparc,
        nome_cliente,
        codemp,
        dtlim,
        limcred,
        logradouro,
        numero,
        bairro,
        cidade,
        uf,
        cep,
        lat,
        lng
      FROM CTE
      WHERE rn = 1
      ORDER BY nome_cliente;
    `;

    const result = await runQuery(sqlQuery, request => {
      request.input('codvend', codvend);
    });

    res.json({ carteira: result.recordset });
  } catch (e) {
    console.error('Erro GET /api/v1/carteira:', e);
    res
      .status(500)
      .json({ error: 'Erro ao buscar carteira', detail: e.message });
  }
});

/* ================== PEDIDOS PENDENTES ================== */

app.get('/api/v1/pedidos-pendentes', async (req, res) => {
  try {
    const codvendRaw = req.query.codvend;
    const codvend = codvendRaw ? parseInt(codvendRaw, 10) : null;

    if (codvendRaw && (Number.isNaN(codvend) || codvend <= 0)) {
      return res.status(400).json({
        error: 'Parâmetro "codvend", se informado, deve ser numérico e > 0.'
      });
    }

    const sqlBase = `
      SELECT
        pped.NUNOTA,
        pped.NUMNOTA,
        pped.CODPARC,
        pped.NOME_CLIENTE,
        pped.CODVEND,
        pped.NOME_VENDEDOR,
        pped.CODEMP,
        pped.DTNEG,
        pped.TIPMOV,
        pped.CODTIPOPER,
        pped.CODTIPVENDA,
        pped.PENDENTE,
        par.ParceiroLogradouro             AS logradouro,
        ISNULL(par.ParceiroEnderecoNumero, 0) AS numero,
        par.ParceiroBairro                 AS bairro,
        par.ParceiroCidade                 AS cidade,
        par.ParceiroUFSigla                AS uf,
        par.ParceiroCEP                    AS cep,
        par.ParceiroLatitude               AS lat,
        par.ParceiroLongitude              AS lng
      FROM dbo.fatVendasPendentes pped
      LEFT JOIN dbo.dimParceiroSkw par
             ON par.ParceiroCodigo = pped.CODPARC
      WHERE 1 = 1
    `;

    const sqlQuery = codvend
      ? sqlBase +
        ' AND pped.CODVEND = @codvend ORDER BY pped.DTNEG DESC, pped.NUNOTA DESC;'
      : sqlBase + ' ORDER BY pped.DTNEG DESC, pped.NUNOTA DESC;';

    const result = await runQuery(sqlQuery, request => {
      if (codvend) {
        request.input('codvend', codvend);
      }
    });

    res.json({ pedidos: result.recordset });
  } catch (e) {
    console.error('Erro GET /api/v1/pedidos-pendentes:', e);
    res.status(500).json({
      error: 'Erro ao buscar pedidos pendentes',
      detail: e.message
    });
  }
});

/* ================== CONTATOS ================== */

app.get('/api/v1/contatos', async (req, res) => {
  try {
    const empresa = req.query.empresa;
    if (!empresa) {
      return res
        .status(400)
        .json({ error: 'Parâmetro "empresa" é obrigatório.' });
    }

    const pool = await getPoolWithRetry();
    const result = await pool
      .request()
      .input('empresa', empresa)
      .query(`
        SELECT
          id,
          empresa,
          nome,
          telefone,
          criado_por,
          criado_em,
          atualizado_por,
          atualizado_em
        FROM dbo.dimContatos
        WHERE empresa = @empresa
        ORDER BY nome;
      `);

    res.json({ contatos: result.recordset });
  } catch (e) {
    console.error('Erro GET /api/v1/contatos:', e);
    res
      .status(500)
      .json({ error: 'Erro ao buscar contatos', detail: e.message });
  }
});

app.post('/api/v1/contatos', async (req, res) => {
  try {
    const { empresa, nome, telefone, usuarioEmail } = req.body || {};

    if (!empresa || !nome || !telefone) {
      return res.status(400).json({
        error: 'Campos obrigatórios: empresa, nome, telefone'
      });
    }

    const pool = await getPoolWithRetry();
    const result = await pool
      .request()
      .input('empresa', empresa)
      .input('nome', nome)
      .input('telefone', telefone)
      .input('criado_por', usuarioEmail || getUsuarioFromReq(req))
      .query(`
        INSERT INTO dbo.dimContatos (empresa, nome, telefone, criado_por, criado_em)
        OUTPUT INSERTED.*
        VALUES (@empresa, @nome, @telefone, @criado_por, SYSDATETIME());
      `);

    const contato = result.recordset[0];

    await logAuditGenerico(pool, {
      entidade: 'contato',
      entidadeId: contato.id,
      acao: 'CREATE',
      usuarioEmail: usuarioEmail || getUsuarioFromReq(req),
      empresa: contato.empresa,
      detalhes: { novo: contato }
    });

    res.status(201).json({ contato });
  } catch (e) {
    console.error('Erro POST /api/v1/contatos:', e);
    res
      .status(500)
      .json({ error: 'Erro ao criar contato', detail: e.message });
  }
});

app.put('/api/v1/contatos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || id <= 0) {
      return res.status(400).json({ error: 'Id inválido.' });
    }

    const { nome, telefone, usuarioEmail } = req.body || {};
    if (!nome || !telefone) {
      return res.status(400).json({
        error: 'Campos obrigatórios: nome, telefone'
      });
    }

    const pool = await getPoolWithRetry();

    const rsAntes = await pool
      .request()
      .input('id', id)
      .query(`
        SELECT *
        FROM dbo.dimContatos
        WHERE id = @id;
      `);

    const anterior = rsAntes.recordset[0];
    if (!anterior) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    const result = await pool
      .request()
      .input('id', id)
      .input('nome', nome)
      .input('telefone', telefone)
      .input('atualizado_por', usuarioEmail || getUsuarioFromReq(req))
      .query(`
        UPDATE dbo.dimContatos
        SET
          nome = @nome,
          telefone = @telefone,
          atualizado_por = @atualizado_por,
          atualizado_em = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @id;
      `);

    const contato = result.recordset[0];

    await logAuditGenerico(pool, {
      entidade: 'contato',
      entidadeId: id,
      acao: 'UPDATE',
      usuarioEmail: usuarioEmail || getUsuarioFromReq(req),
      empresa: contato.empresa,
      detalhes: { antes: anterior, depois: contato }
    });

    res.json({ contato });
  } catch (e) {
    console.error('Erro PUT /api/v1/contatos/:id:', e);
    res
      .status(500)
      .json({ error: 'Erro ao atualizar contato', detail: e.message });
  }
});

app.delete('/api/v1/contatos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || id <= 0) {
      return res.status(400).json({ error: 'Id inválido.' });
    }

    const usuarioEmailBody = (req.body && req.body.usuarioEmail) || null;
    const usuario = usuarioEmailBody || getUsuarioFromReq(req);

    const pool = await getPoolWithRetry();

    const rsAntes = await pool
      .request()
      .input('id', id)
      .query(`
        SELECT *
        FROM dbo.dimContatos
        WHERE id = @id;
      `);

    const anterior = rsAntes.recordset[0];
    if (!anterior) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    const result = await pool
      .request()
      .input('id', id)
      .query(`
        DELETE FROM dbo.dimContatos
        WHERE id = @id;
      `);

    const rows =
      result.rowsAffected && result.rowsAffected[0]
        ? result.rowsAffected[0]
        : 0;
    if (rows === 0) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    await logAuditGenerico(pool, {
      entidade: 'contato',
      entidadeId: id,
      acao: 'DELETE',
      usuarioEmail: usuario,
      empresa: anterior.empresa,
      detalhes: { antes: anterior }
    });

    res.status(204).send();
  } catch (e) {
    console.error('Erro DELETE /api/v1/contatos/:id:', e);
    res
      .status(500)
      .json({ error: 'Erro ao excluir despesa', detail: e.message });
  }
});

/* ================== DESPESAS (MANUAIS DO SITE) ================== */

app.get('/api/v1/despesas', async (req, res) => {
  const mes = req.query.mes;
  const empresa = req.query.empresa || null;

  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return res
      .status(400)
      .json({ error: 'Parâmetro "mes" é obrigatório no formato YYYY-MM.' });
  }

  try {
    const ano = mes.substring(0, 4);
    const mesNum = mes.substring(5, 7);

    const dataInicio = `${ano}-${mesNum}-01`;

    const mesInt = parseInt(mesNum, 10);
    const anoInt = parseInt(ano, 10);
    const proximoMes = mesInt === 12 ? 1 : mesInt + 1;
    const anoProx = mesInt === 12 ? anoInt + 1 : anoInt;

    const dataProxMes = new Date(
      `${anoProx}-${String(proximoMes).padStart(2, '0')}-01T00:00:00Z`
    );
    const dataFimDate = new Date(
      dataProxMes.getTime() - 24 * 60 * 60 * 1000
    );
    const dataFim = dataFimDate.toISOString().substring(0, 10);

    const pool = await getPoolWithRetry();

    const result = await pool
      .request()
      .input('dataInicio', dataInicio)
      .input('dataFim', dataFim)
      .input('empresa', empresa)
      .query(`
        SELECT
          IdDespesa       AS id,
          Empresa         AS empresa,
          Descricao       AS descricao,
          DataVencimento  AS data_vencimento,
          Status          AS status,
          RecorrenciaTipo AS recorrencia_tipo,
          TiposAviso      AS tipos_aviso,
          ContatosJson    AS contatos_json
        FROM dbo.dimDespesasVisya
        WHERE DataVencimento BETWEEN @dataInicio AND @dataFim
          AND (@empresa IS NULL OR Empresa = @empresa)
        ORDER BY DataVencimento, IdDespesa
      `);

    const despesas = result.recordset.map(d => ({
      id: d.id,
      empresa: d.empresa,
      descricao: d.descricao,
      data_vencimento: d.data_vencimento,
      status: d.status,
      recorrencia_tipo: d.recorrencia_tipo,
      tipos_aviso: d.tipos_aviso
        ? String(d.tipos_aviso)
            .split(',')
            .map(x => x.trim())
            .filter(Boolean)
        : ['3'],
      contatos: d.contatos_json ? JSON.parse(d.contatos_json) : []
    }));

    res.json({
      mes,
      data_inicio: dataInicio,
      data_fim: dataFim,
      despesas
    });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ error: 'Erro ao buscar despesas', detail: e.message });
  }
});

app.post('/api/v1/despesas', async (req, res) => {
  try {
    const {
      empresa,
      descricao,
      data_vencimento,
      status,
      recorrencia_tipo,
      tipos_aviso,
      contatos
    } = req.body || {};

    if (!empresa || !descricao || !data_vencimento) {
      return res.status(400).json({
        error: 'Campos obrigatórios: empresa, descricao, data_vencimento'
      });
    }

    const tiposAvisoStr = Array.isArray(tipos_aviso)
      ? tipos_aviso.join(',')
      : '3';

    const contatosJson = Array.isArray(contatos)
      ? JSON.stringify(contatos)
      : JSON.stringify([]);

    const pool = await getPoolWithRetry();

    const insertResult = await pool
      .request()
      .input('empresa', empresa)
      .input('descricao', descricao)
      .input('dataVencimento', data_vencimento)
      .input('status', status || 'pendente')
      .input('recorrenciaTipo', recorrencia_tipo || 'nao')
      .input('tiposAviso', tiposAvisoStr)
      .input('contatosJson', contatosJson)
      .query(`
        INSERT INTO dbo.dimDespesasVisya
          (Empresa, Descricao, DataVencimento, Status, RecorrenciaTipo, TiposAviso, ContatosJson)
        OUTPUT INSERTED.IdDespesa AS id
        VALUES
          (@empresa, @descricao, @dataVencimento, @status, @recorrenciaTipo, @tiposAviso, @contatosJson);
      `);

    const novaId = insertResult.recordset[0].id;

    await logDespesa(pool, {
      operacao: 'CREATE',
      usuarioEmail: getUsuarioFromReq(req),
      idDespesa: novaId,
      empresa,
      antes: null,
      depois: {
        id: novaId,
        empresa,
        descricao,
        data_vencimento,
        status: status || 'pendente',
        recorrencia_tipo: recorrencia_tipo || 'nao',
        tipos_aviso: Array.isArray(tipos_aviso) ? tipos_aviso : ['3'],
        contatos: Array.isArray(contatos) ? contatos : []
      },
      detalhes: {
        origem: 'API_POST',
        tipos_aviso,
        contatos
      }
    });

    res.status(201).json({
      id: novaId,
      empresa,
      descricao,
      data_vencimento,
      status: status || 'pendente',
      recorrencia_tipo: recorrencia_tipo || 'nao',
      tipos_aviso: Array.isArray(tipos_aviso) ? tipos_aviso : ['3'],
      contatos: Array.isArray(contatos) ? contatos : []
    });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ error: 'Erro ao criar despesa', detail: e.message });
  }
});

app.put('/api/v1/despesas/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || id <= 0) {
      return res.status(400).json({ error: 'Id inválido.' });
    }

    const {
      empresa,
      descricao,
      data_vencimento,
      status,
      recorrencia_tipo,
      tipos_aviso,
      contatos
    } = req.body || {};

    const campos = [];
    const params = {};

    if (empresa !== undefined) {
      campos.push('Empresa = @empresa');
      params.empresa = empresa;
    }
    if (descricao !== undefined) {
      campos.push('Descricao = @descricao');
      params.descricao = descricao;
    }
    if (data_vencimento !== undefined) {
      campos.push('DataVencimento = @dataVencimento');
      params.dataVencimento = data_vencimento;
    }
    if (status !== undefined) {
      campos.push('Status = @status');
      params.status = status;
    }
    if (recorrencia_tipo !== undefined) {
      campos.push('RecorrenciaTipo = @recorrenciaTipo');
      params.recorrenciaTipo = recorrencia_tipo;
    }
    if (tipos_aviso !== undefined) {
      const tiposAvisoStr = Array.isArray(tipos_aviso)
        ? tipos_aviso.join(',')
        : String(tipos_aviso || '');
      campos.push('TiposAviso = @tiposAviso');
      params.tiposAviso = tiposAvisoStr;
    }
    if (contatos !== undefined) {
      const contatosJson = Array.isArray(contatos)
        ? JSON.stringify(contatos)
        : JSON.stringify([]);
      campos.push('ContatosJson = @contatosJson');
      params.contatosJson = contatosJson;
    }

    if (campos.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
    }

    const pool = await getPoolWithRetry();

    const rsAntes = await pool
      .request()
      .input('id', id)
      .query(`
        SELECT
          IdDespesa       AS id,
          Empresa         AS empresa,
          Descricao       AS descricao,
          DataVencimento  AS data_vencimento,
          Status          AS status,
          RecorrenciaTipo AS recorrencia_tipo,
          TiposAviso      AS tipos_aviso,
          ContatosJson    AS contatos_json
        FROM dbo.dimDespesasVisya
        WHERE IdDespesa = @id;
      `);

    const antesRow = rsAntes.recordset[0] || null;

    const request = pool.request();
    for (const [nome, valor] of Object.entries(params)) {
      request.input(nome, valor);
    }
    request.input('id', id);

    const sqlUpdate = `
      UPDATE dbo.dimDespesasVisya
      SET
        ${campos.join(', ')},
        AtualizadoEm = sysutcdatetime()
      WHERE IdDespesa = @id;

      SELECT
        IdDespesa       AS id,
        Empresa         AS empresa,
        Descricao       AS descricao,
        DataVencimento  AS data_vencimento,
        Status          AS status,
        RecorrenciaTipo AS recorrencia_tipo,
        TiposAviso      AS tipos_aviso,
        ContatosJson    AS contatos_json
      FROM dbo.dimDespesasVisya
      WHERE IdDespesa = @id;
    `;

    const result = await request.query(sqlUpdate);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Despesa não encontrada.' });
    }

    const d = result.recordset[0];

    await logDespesa(pool, {
      operacao: 'UPDATE',
      usuarioEmail: getUsuarioFromReq(req),
      idDespesa: id,
      empresa: d.empresa,
      antes: antesRow
        ? {
            id: antesRow.id,
            empresa: antesRow.empresa,
            descricao: antesRow.descricao,
            data_vencimento: antesRow.data_vencimento,
            status: antesRow.status,
            recorrencia_tipo: antesRow.recorrencia_tipo,
            tipos_aviso: antesRow.tipos_aviso,
            contatos: antesRow.contatos_json
              ? JSON.parse(antesRow.contatos_json)
              : []
          }
        : null,
      depois: {
        id: d.id,
        empresa: d.empresa,
        descricao: d.descricao,
        data_vencimento: d.data_vencimento,
        status: d.status,
        recorrencia_tipo: d.recorrencia_tipo,
        tipos_aviso: d.tipos_aviso,
        contatos: d.contatos_json ? JSON.parse(d.contatos_json) : []
      },
      detalhes: {
        origem: 'API_PUT',
        camposAlterados: Object.keys(params),
        tipos_aviso,
        contatos
      }
    });

    res.json({
      id: d.id,
      empresa: d.empresa,
      descricao: d.descricao,
      data_vencimento: d.data_vencimento,
      status: d.status,
      recorrencia_tipo: d.recorrencia_tipo,
      tipos_aviso: d.tipos_aviso
        ? String(d.tipos_aviso)
            .split(',')
            .map(x => x.trim())
            .filter(Boolean)
        : ['3'],
      contatos: d.contatos_json ? JSON.parse(d.contatos_json) : []
    });
  } catch (e) {
    console.error('Erro ao atualizar despesa', e);
    res
      .status(500)
      .json({ error: 'Erro ao atualizar despesa', detail: e.message });
  }
});

app.delete('/api/v1/despesas/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || id <= 0) {
      return res.status(400).json({ error: 'Id inválido.' });
    }

    const pool = await getPoolWithRetry();

    const rsAntes = await pool
      .request()
      .input('id', id)
      .query(`
        SELECT
          IdDespesa       AS id,
          Empresa         AS empresa,
          Descricao       AS descricao,
          DataVencimento  AS data_vencimento,
          Status          AS status,
          RecorrenciaTipo AS recorrencia_tipo,
          TiposAviso      AS tipos_aviso,
          ContatosJson    AS contatos_json
        FROM dbo.dimDespesasVisya
        WHERE IdDespesa = @id;
      `);

    const antesRow = rsAntes.recordset[0] || null;

    const result = await pool
      .request()
      .input('id', id)
      .query(`
        DELETE FROM dbo.dimDespesasVisya
        WHERE IdDespesa = @id;
      `);

    const rows =
      result.rowsAffected && result.rowsAffected[0]
        ? result.rowsAffected[0]
        : 0;

    if (rows === 0) {
      return res.status(404).json({ error: 'Despesa não encontrada.' });
    }

    await logDespesa(pool, {
      operacao: 'DELETE',
      usuarioEmail: getUsuarioFromReq(req),
      idDespesa: id,
      empresa: antesRow ? antesRow.empresa : null,
      antes: antesRow
        ? {
            id: antesRow.id,
            empresa: antesRow.empresa,
            descricao: antesRow.descricao,
            data_vencimento: antesRow.data_vencimento,
            status: antesRow.status,
            recorrencia_tipo: antesRow.recorrencia_tipo,
            tipos_aviso: antesRow.tipos_aviso,
            contatos: antesRow.contatos_json
              ? JSON.parse(antesRow.contatos_json)
              : []
          }
        : null,
      depois: null,
      detalhes: {
        origem: 'API_DELETE'
      }
    });

    res.status(204).send();
  } catch (e) {
    console.error('Erro ao excluir despesa', e);
    res
      .status(500)
      .json({ error: 'Erro ao excluir despesa', detail: e.message });
  }
});

app.get('/api/v1/despesas-financeiro', async (req, res) => {
  try {
    const empresa = (req.query.empresa || '').toString();

    let sqlBusca = `
      SELECT
        Id, NUFIN, NUMNOTA, CODPARC, CODEMP, CODTIPOPER, RECDESP,
        DESDOBRAMENTO, NURENEG, CODNAT, NOME_NATUREZA, NUFTC,
        CODCENCUS, CODCTABCOINT, CODTIPTIT, ORIGEM, NUNOTA,
        PROVISAO, VLRDESDOB, DTENTSAI, DHBAIXA, DTVENC,
        CODVEND, HISTORICO
      FROM dbo.fatFinanceiroSkwDespesa
      WHERE RECDESP = -1
        AND DTVENC >= '2026-01-01'
    `;

    if (empresa === 'linhagro') {
      sqlBusca += ' AND CODEMP BETWEEN 30 AND 39';
    } else if (empresa === 'lithoplant') {
      sqlBusca += ' AND CODEMP IN (80, 81)';
    } else {
      // se quiser deixar sem filtro quando não passar empresa:
      sqlBusca += ' AND (CODEMP BETWEEN 30 AND 39 OR CODEMP IN (80,81))';
    }

    sqlBusca += ' ORDER BY DTVENC ASC, Id ASC;';

    const result = await runQuery(sqlBusca, () => {});
    res.json({ despesas_financeiro: result.recordset });
  } catch (e) {
    console.error('Erro GET /api/v1/despesas-financeiro:', e);
    res.status(500).json({
      error: 'Erro ao buscar despesas financeiro',
      detail: e.message
    });
  }
});


const port = process.env.PORT || 3000;
app.listen(port, () => console.log('API rodando na porta ' + port));
