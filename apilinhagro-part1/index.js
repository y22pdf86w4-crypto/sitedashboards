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
        p.ParceiroCodigo         AS codigo,
        p.ParceiroNome           AS nome,
        p.ParceiroLogradouro     AS logradouro,
        ISNULL(p.ParceiroEnderecoNumero, 0) AS numero,
        p.ParceiroBairro         AS bairro,
        p.ParceiroCidade         AS cidade,
        p.ParceiroUFSigla        AS uf,
        p.ParceiroCEP            AS cep,
        p.ParceiroLatitude       AS lat,
        p.ParceiroLongitude      AS lng
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

/* ================== HELPER CTE REGIAO DETALHADA ================== */
const CTE_PARCEIRO_REGIAO = `
;WITH ParceiroRegiao AS (
  SELECT
    p.ParceiroCodigo,
    p.ParceiroCidade,
    p.ParceiroNome,
    p.ParceiroLatitude  AS lat,
    p.ParceiroLongitude AS lng,
    CASE
      WHEN UPPER(LTRIM(RTRIM(p.ParceiroCidade))) IN
        ('VITORIA','VITÓRIA','VILA VELHA','SERRA','CARIACICA','VIANA','GUARAPARI') THEN 1
      WHEN UPPER(LTRIM(RTRIM(p.ParceiroCidade))) IN
        ('SAO MATEUS','SÃO MATEUS','LINHARES','RIO BANANAL',
         'CONCEICAO DA BARRA','CONCEIÇÃO DA BARRA','SOORETAMA','ARACRUZ',
         'JAGUARE','JAGUARÉ','MUCURICI','MUCURI',
         'NOVA VICOSA','NOVA VIÇOSA','TEIXEIRA DE FREITAS','PRADO',
         'CARAVELAS','ITAMARAJU','EUNAPOLIS','EUNÁPOLIS',
         'PORTO SEGURO','ITABELA','UNA','CANAVIEIRAS') THEN 2
      WHEN UPPER(LTRIM(RTRIM(p.ParceiroCidade))) IN
        ('COLATINA','BAIXO GUANDU','PANCAS',
         'SAO DOMINGOS DO NORTE','SÃO DOMINGOS DO NORTE','SAO DOMINGOS NORTE',
         'SAO GABRIEL DA PALHA','SÃO GABRIEL DA PALHA',
         'ECOPORANGA',
         'BARRA DE SÃO FRANCISCO','BARRA SAO FRANCISCO',
         'VILA PAVAO','VILA PAVÃO',
         'VILA VALERIO','VILA VALÉRIO',
         'NOVA VENECIA','NOVA VENÉCIA',
         'GOVERNADOR LINDENBERG','GOV LINDENBERG',
         'AGUIA BRANCA','ÁGUIA BRANCA',
         'BOA ESPERANCA','BOA ESPERANÇA',
         'MANTENOPOLIS','MANTENÓPOLIS',
         'PONTO BELO','ALTO RIO NOVO',
         'MARILANDIA','MARILÂNDIA',
         'MONTANHA','PINHEIROS') THEN 3
      WHEN UPPER(LTRIM(RTRIM(p.ParceiroCidade))) IN
        ('CACHOEIRO DE ITAPEMIRIM','CACHOEIRO ITAPEMIRIM',
         'CASTELO','ITAPEMIRIM',
         'MARATAIZES','MARATAÍZES',
         'MIMOSO DO SUL','MUQUI','VARGEM ALTA',
         'GUAÇUI','GUACUI','ALEGRE',
         'DIVINO DE SAO LOURENCO','DIVINO SAO LOURENCO',
         'DORES DO RIO PRETO','PRESIDENTE KENNEDY',
         'JERONIMO MONTEIRO','JERÔNIMO MONTEIRO',
         'ATILIO VIVACQUA','ATÍLIO VIVACQUA',
         'MUNIZ FREIRE','ALFREDO CHAVES','ICONHA',
         'PIUMA','PIÚMA','RIO NOVO DO SUL',
         'ITAGUACU','ITAGUAÇU') THEN 4
      WHEN UPPER(LTRIM(RTRIM(p.ParceiroCidade))) IN
        ('DOMINGOS MARTINS','ARACÊ (DOMINGOS MARTINS)','ARACÊ',
         'MARECHAL FLORIANO',
         'SANTA MARIA DE JETIBA','SANTA MARIA DE JETIBÁ',
         'SANTA TERESA','SANTA LEOPOLDINA',
         'VENDA NOVA DO IMIGRANTE','VENDA NOVA IMIGRANTE',
         'LARANJA DA TERRA',
         'AFONSO CLAUDIO','AFONSO CLÁUDIO',
         'ITARANA',
         'SAO ROQUE DO CANAA','SÃO ROQUE DO CANAÃ',
         'FUNDAO','FUNDÃO',
         'JOAO NEIVA','JOÃO NEIVA',
         'IBIRACU','IBIRAÇU',
         'BREJETUBA') THEN 5
      WHEN UPPER(LTRIM(RTRIM(p.ParceiroCidade))) IN
        ('BELO HORIZONTE','UBERLANDIA','UBERLÂNDIA','UBERABA',
         'GOVERNADOR VALADARES','MONTES CLAROS','JUIZ DE FORA',
         'MANHUACU','MANHUAÇU','NANUQUE','IPATINGA','VARGINHA','MURIAE','MURIAÉ') THEN 6
      WHEN UPPER(LTRIM(RTRIM(p.ParceiroCidade))) IN
        ('SAO PAULO','SÃO PAULO','CAMPINAS','SOROCABA',
         'RIBEIRAO PRETO','RIBEIRÃO PRETO',
         'SAO JOSE DOS CAMPOS','SÃO JOSÉ DOS CAMPOS',
         'SAO JOSE DO RIO PRETO','SÃO JOSÉ DO RIO PRETO') THEN 7
      WHEN UPPER(LTRIM(RTRIM(p.ParceiroCidade))) IN
        ('RIO DE JANEIRO','NITEROI','NITERÓI','DUQUE DE CAXIAS',
         'CAMPOS DOS GOYTACAZES','CAMPOS GOYTACAZES','MACAE','MACAÉ','VOLTA REDONDA') THEN 8
      WHEN UPPER(LTRIM(RTRIM(p.ParceiroCidade))) IN
        ('SALVADOR','FEIRA DE SANTANA','RECIFE','FORTALEZA','NATAL','MACEIO','MACEIÓ') THEN 9
      WHEN UPPER(LTRIM(RTRIM(p.ParceiroCidade))) IN
        ('GOIANIA','GOIÂNIA','CUIABA','CUIABÁ','CAMPO GRANDE',
         'CURITIBA','LONDRINA','FLORIANOPOLIS','FLORIANÓPOLIS','PORTO ALEGRE') THEN 10
      ELSE 6
    END AS RegiaoDetalhada_Num
  FROM dbo.dimParceiroSkw AS p
)
`;


/* ========= INADIMPLÊNCIA: DASHBOARD (API 1) ========= */
/**
 * GET /api/v1/inadimplencia/dashboard
 * Filtros: dataIni, dataFim (DTNEG), vendedor, cliente, regiao, vendedorNome, clienteNome
 */
app.get('/api/v1/inadimplencia/dashboard', async (req, res) => {
  try {
    const {
      dataIni,
      dataFim,
      vendedor: vendedorStr,
      cliente: clienteStr,
      regiao: regiaoStr,
      vendedorNome,
      clienteNome
    } = req.query;

    const sqlDashboard = `
      ${CTE_PARCEIRO_REGIAO},
      CarteiraPorCliente AS (
        SELECT
          c.CODPARC,
          c.CODVEND,
          c.NOME_VENDEDOR,
          ROW_NUMBER() OVER (
            PARTITION BY c.CODPARC
            ORDER BY c.DTLIM DESC, c.CODEMP DESC
          ) AS rn
        FROM dbo.dimCarteiraSKW c
      ),
      ConsultaPorCliente AS (
        SELECT
          f.CODPARC                     AS codparc,
          pr.ParceiroNome               AS nome_cliente,
          pr.RegiaoDetalhada_Num        AS regiao,
          pr.lat,
          pr.lng,
          cart.CODVEND                  AS cod_vendedor,
          cart.NOME_VENDEDOR            AS nome_vendedor,
          SUM(f.VLRDESDOB)              AS valor_inadimplencia
        FROM dbo.fatFinanceiroSkwReceita AS f
        LEFT JOIN ParceiroRegiao AS pr
          ON f.CODPARC = pr.ParceiroCodigo
        LEFT JOIN CarteiraPorCliente AS cart
          ON cart.CODPARC = f.CODPARC
         AND cart.rn = 1
        WHERE f.DHBAIXA IS NULL                    -- só em aberto
          AND f.DTVENC < CAST(GETDATE() AS date)   -- vencidos até hoje
          AND f.RECDESP = 1
          AND f.PROVISAO = 'N'
          AND f.CODEMP BETWEEN 30 AND 39
          AND f.CODNAT IN (1010101, 3022500)
          -- AQUI: range por DTVENC, não DTNEG
          AND (@DataIni IS NULL OR f.DTVENC >= @DataIni)
          AND (@DataFim IS NULL OR f.DTVENC <= @DataFim)
          AND (@CodVendedor IS NULL OR cart.CODVEND = @CodVendedor)
          AND (@CodParc     IS NULL OR f.CODPARC = @CodParc)
          AND (@Regiao      IS NULL OR pr.RegiaoDetalhada_Num = @Regiao)
          AND (@VendedorNome IS NULL OR cart.NOME_VENDEDOR LIKE '%' + @VendedorNome + '%')
          AND (@ClienteNome  IS NULL OR pr.ParceiroNome  LIKE '%' + @ClienteNome  + '%')
        GROUP BY
          f.CODPARC,
          pr.ParceiroNome,
          pr.RegiaoDetalhada_Num,
          pr.lat,
          pr.lng,
          cart.CODVEND,
          cart.NOME_VENDEDOR
        HAVING SUM(f.VLRDESDOB) > 0
      )
      SELECT
        c.codparc,
        c.nome_cliente,
        c.regiao,
        c.lat,
        c.lng,
        c.cod_vendedor,
        c.nome_vendedor,
        c.valor_inadimplencia,
        tot.valor_inadimplencia_total,
        tot.qtde_clientes_inad,
        tot.ticket_medio_geral
      FROM ConsultaPorCliente AS c
      CROSS JOIN (
        SELECT
          SUM(valor_inadimplencia)                   AS valor_inadimplencia_total,
          COUNT(*)                                   AS qtde_clientes_inad,
          SUM(valor_inadimplencia) * 1.0 / COUNT(*)  AS ticket_medio_geral
        FROM ConsultaPorCliente
      ) AS tot
      ORDER BY c.valor_inadimplencia DESC;
    `;

    const result = await runQuery(sqlDashboard, request => {
      request.input('DataIni', dataIni ? new Date(dataIni) : null);
      request.input('DataFim', dataFim ? new Date(dataFim) : null);
      request.input(
        'CodVendedor',
        vendedorStr ? parseInt(vendedorStr, 10) : null
      );
      request.input('CodParc', clienteStr ? parseInt(clienteStr, 10) : null);
      request.input('Regiao', regiaoStr ? parseInt(regiaoStr, 10) : null);
      request.input('VendedorNome', vendedorNome || null);
      request.input('ClienteNome', clienteNome || null);
    });

    const rows = result.recordset || [];

    let total = 0;
    let qtde = 0;
    let ticket = 0;

    if (rows.length > 0) {
      total = Number(rows[0].valor_inadimplencia_total || 0);
      qtde = Number(rows[0].qtde_clientes_inad || 0);
      ticket = Number(rows[0].ticket_medio_geral || 0);
    }

    const clientes = rows.map(r => ({
      codparc: r.codparc,
      nome_cliente: r.nome_cliente,
      regiao: r.regiao,
      lat: r.lat !== null ? Number(r.lat) : null,
      lng: r.lng !== null ? Number(r.lng) : null,
      cod_vendedor: r.cod_vendedor,
      nome_vendedor: r.nome_vendedor,
      valor_inadimplencia: Number(r.valor_inadimplencia || 0)
    }));

    res.json({
      total_inadimplencia: total,
      qtde_clientes_inadimplentes: qtde,
      ticket_medio_geral: ticket,
      clientes
    });
  } catch (e) {
    console.error('Erro GET /api/v1/inadimplencia/dashboard:', e);
    res.status(500).json({
      error: 'Erro ao calcular dashboard inadimplência',
      detail: e.message
    });
  }
});

/* ========= VENDAS: DASHBOARD (API 2) ========= */
/**
 * GET /api/v1/vendas/dashboard
 * Filtros: dataIni, dataFim (DataVenda), vendedor, cliente, regiao, vendedorNome, clienteNome
 */
app.get('/api/v1/vendas/dashboard', async (req, res) => {
  try {
    const {
      dataIni,
      dataFim,
      vendedor: vendedorStr,
      cliente: clienteStr,
      regiao: regiaoStr,
      vendedorNome,
      clienteNome
    } = req.query;

    const sqlVendas = `
      ${CTE_PARCEIRO_REGIAO},
      CarteiraPorCliente AS (
        SELECT
          c.CODPARC,
          c.CODVEND,
          c.NOME_VENDEDOR,
          ROW_NUMBER() OVER (
            PARTITION BY c.CODPARC
            ORDER BY c.DTLIM DESC, c.CODEMP DESC
          ) AS rn
        FROM dbo.dimCarteiraSKW c
      ),
      VendasPorCliente AS (
        SELECT
          fv.ParceiroCodigo      AS codparc,
          fv.VendedorCodigo      AS cod_vendedor_venda,
          SUM(fv.ValorVenda)     AS valor_venda
        FROM dbo.fatVendas AS fv
        WHERE (@DataIni IS NULL OR fv.DataVenda >= @DataIni)
          AND (@DataFim IS NULL OR fv.DataVenda <= @DataFim)
          AND fv.EmpresaCodigo BETWEEN 30 AND 39   -- filtro padrão de empresa
        GROUP BY fv.ParceiroCodigo, fv.VendedorCodigo
      ),
      ConsultaPorCliente AS (
        SELECT
          vpc.codparc                    AS codparc,
          pr.ParceiroNome                AS nome_cliente,
          pr.RegiaoDetalhada_Num         AS regiao,
          pr.lat,
          pr.lng,
          vpc.cod_vendedor_venda         AS cod_vendedor,   -- vendedor da venda
          cart.NOME_VENDEDOR             AS nome_vendedor,  -- nome via carteira
          vpc.valor_venda                AS valor_venda
        FROM VendasPorCliente AS vpc
        LEFT JOIN ParceiroRegiao AS pr
          ON vpc.codparc = pr.ParceiroCodigo
        LEFT JOIN CarteiraPorCliente AS cart
          ON cart.CODPARC = vpc.codparc
         AND cart.rn = 1
        WHERE (@CodVendedor IS NULL OR vpc.cod_vendedor_venda = @CodVendedor)
          AND (@CodParc     IS NULL OR vpc.codparc = @CodParc)
          AND (@Regiao      IS NULL OR pr.RegiaoDetalhada_Num = @Regiao)
          AND (@VendedorNome IS NULL OR cart.NOME_VENDEDOR LIKE '%' + @VendedorNome + '%')
          AND (@ClienteNome  IS NULL OR pr.ParceiroNome  LIKE '%' + @ClienteNome  + '%')
      )
      SELECT
        c.codparc,
        c.nome_cliente,
        c.regiao,
        c.lat,
        c.lng,
        c.cod_vendedor,
        c.nome_vendedor,
        c.valor_venda,
        tot.valor_venda_total,
        tot.qtde_clientes_venda,
        tot.ticket_medio_venda_geral
      FROM ConsultaPorCliente AS c
      CROSS JOIN (
        SELECT
          SUM(valor_venda)                   AS valor_venda_total,
          COUNT(*)                           AS qtde_clientes_venda,
          SUM(valor_venda) * 1.0 / COUNT(*)  AS ticket_medio_venda_geral
        FROM ConsultaPorCliente
      ) AS tot
      ORDER BY c.valor_venda DESC;
    `;

    const result = await runQuery(sqlVendas, request => {
      request.input('DataIni', dataIni ? new Date(dataIni) : null);
      request.input('DataFim', dataFim ? new Date(dataFim) : null);
      request.input(
        'CodVendedor',
        vendedorStr ? parseInt(vendedorStr, 10) : null
      );
      request.input('CodParc', clienteStr ? parseInt(clienteStr, 10) : null);
      request.input('Regiao', regiaoStr ? parseInt(regiaoStr, 10) : null);
      request.input('VendedorNome', vendedorNome || null);
      request.input('ClienteNome', clienteNome || null);
    });

    const rows = result.recordset || [];

    let total = 0;
    let qtde = 0;
    let ticket = 0;

    if (rows.length > 0) {
      total = Number(rows[0].valor_venda_total || 0);
      qtde = Number(rows[0].qtde_clientes_venda || 0);
      ticket = Number(rows[0].ticket_medio_venda_geral || 0);
    }

    const clientes = rows.map(r => ({
      codparc: r.codparc,
      nome_cliente: r.nome_cliente,
      regiao: r.regiao,
      lat: r.lat !== null ? Number(r.lat) : null,
      lng: r.lng !== null ? Number(r.lng) : null,
      cod_vendedor: r.cod_vendedor,
      nome_vendedor: r.nome_vendedor,
      valor_venda: Number(r.valor_venda || 0)
    }));

    res.json({
      valor_venda_total: total,
      qtde_clientes_venda: qtde,
      ticket_medio_venda_geral: ticket,
      clientes
    });
  } catch (e) {
    console.error('Erro GET /api/v1/vendas/dashboard:', e);
    res.status(500).json({
      error: 'Erro ao calcular dashboard vendas',
      detail: e.message
    });
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
          p.ParceiroLogradouro                 AS logradouro,
          ISNULL(p.ParceiroEnderecoNumero, 0)  AS numero,
          p.ParceiroBairro                     AS bairro,
          p.ParceiroCidade                     AS cidade,
          p.ParceiroUFSigla                    AS uf,
          p.ParceiroCEP                        AS cep,
          p.ParceiroLatitude                   AS lat,
          p.ParceiroLongitude                  AS lng,
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
        par.ParceiroLogradouro                 AS logradouro,
        ISNULL(par.ParceiroEnderecoNumero, 0)  AS numero,
        par.ParceiroBairro                     AS bairro,
        par.ParceiroCidade                     AS cidade,
        par.ParceiroUFSigla                    AS uf,
        par.ParceiroCEP                        AS cep,
        par.ParceiroLatitude                   AS lat,
        par.ParceiroLongitude                  AS lng
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

/* ================== ESTOQUE (EMPRESA / PRODUTO / GRUPO) + PREÇO ================== */

app.get('/api/v1/estoque', async (req, res) => {
  try {
    const codEmp  = req.query.codemp ? parseInt(req.query.codemp, 10) : null;
    const codProd = req.query.codprod ? parseInt(req.query.codprod, 10) : null;
    const grupo   = req.query.grupo ? req.query.grupo.toString().trim() : '';

    let sqlBase = `
      WITH PrecoPorProduto AS (
        SELECT
          dp.CODIGO_PRODUTO           AS CODPROD,
          MAX(dp.DATA_VIGENCIA)       AS DATA_VIGENCIA_MAX
        FROM dbo.dimPrecoProdutoSkw dp
        GROUP BY dp.CODIGO_PRODUTO
      )
      SELECT
        e.CODEMP,
        emp.NOMEFANTASIA             AS NomeEmpresa,
        e.CODPROD,
        p.DESCRPROD                  AS NomeProduto,
        p.CODGRUPOPROD,
        p.nomeGrupoProduto           AS NomeGrupoProduto,
        SUM(e.ESTOQUE)               AS ESTOQUE,
        SUM(e.RESERVADO)             AS RESERVADO,
        SUM(e.ESTOQUE) - SUM(e.RESERVADO) AS EstoqueDisponivel,
        -- preço (pega o registro da última vigência por produto)
        pp.CODIGO_TABELA             AS CodigoTabelaPreco,
        pp.DATA_VIGENCIA             AS DataVigenciaPreco,
        pp.PRECO_VENDA               AS PrecoVenda
      FROM dbo.dimEstoqueSkw   e
      JOIN dbo.dimProdutosSKW  p   ON p.CODPROD  = e.CODPROD
      JOIN dbo.dimEmpresasBI   emp ON emp.CODEMP = e.CODEMP
      -- join de preço
      LEFT JOIN PrecoPorProduto ref
        ON ref.CODPROD = e.CODPROD
      LEFT JOIN dbo.dimPrecoProdutoSkw pp
        ON pp.CODIGO_PRODUTO = e.CODPROD
       AND pp.DATA_VIGENCIA  = ref.DATA_VIGENCIA_MAX
      WHERE 1 = 1
        AND e.CODLOCAL = 1000000
        AND e.CODEMP <> 80
    `;

    const params = [];

    if (codEmp && !Number.isNaN(codEmp)) {
      sqlBase += ' AND e.CODEMP = @codemp';
      params.push({ name: 'codemp', value: codEmp });
    }

    if (codProd && !Number.isNaN(codProd)) {
      sqlBase += ' AND e.CODPROD = @codprod';
      params.push({ name: 'codprod', value: codProd });
    }

    if (grupo) {
      sqlBase += `
        AND (
              p.CODGRUPOPROD = @grupoCodigo
           OR p.nomeGrupoProduto LIKE @grupoNome
        )
      `;
      params.push({ name: 'grupoCodigo', value: grupo });
      params.push({ name: 'grupoNome',   value: '%' + grupo + '%' });
    }

    sqlBase += `
      GROUP BY
        e.CODEMP,
        emp.NOMEFANTASIA,
        e.CODPROD,
        p.DESCRPROD,
        p.CODGRUPOPROD,
        p.nomeGrupoProduto,
        pp.CODIGO_TABELA,
        pp.DATA_VIGENCIA,
        pp.PRECO_VENDA
      ORDER BY
        emp.NOMEFANTASIA,
        p.nomeGrupoProduto,
        p.DESCRPROD;
    `;

    console.log('[API] /api/v1/estoque SQL:\n', sqlBase);

    const result = await runQuery(sqlBase, request => {
      params.forEach(p => request.input(p.name, p.value));
    });

    res.json({ estoque: result.recordset });
  } catch (e) {
    console.error('Erro GET /api/v1/estoque:', e);
    res.status(500).json({
      error: 'Erro ao buscar estoque',
      detail: e.message
    });
  }
});


/* ================== GAMIFICAÇÃO ================== */

app.get('/api/v1/gamificacao', async (req, res) => {
  try {
    const { inicio, fim, vendedorId } = req.query;

    if (!inicio || !fim) {
      return res.status(400).json({
        error: 'Parâmetros "inicio" e "fim" são obrigatórios (YYYY-MM-DD).'
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
      return res.status(400).json({
        error: 'Parâmetros "inicio" e "fim" devem estar no formato YYYY-MM-DD.'
      });
    }

    const idVendedorInt = vendedorId ? parseInt(vendedorId, 10) : null;
    if (vendedorId && (Number.isNaN(idVendedorInt) || idVendedorInt <= 0)) {
      return res.status(400).json({
        error: 'Parâmetro "vendedorId", se informado, deve ser numérico e > 0.'
      });
    }

    const sqlGamificacao = `
      DECLARE @dtInicioParam DATE = @dtInicio;
      DECLARE @dtFimParam    DATE = @dtFim;
      DECLARE @idVendedorParam INT = @idVendedor;

      WITH Feriados AS (
          SELECT CAST('2026-01-01' AS date) AS dtFeriado
          UNION ALL SELECT CAST('2026-02-17' AS date)
          UNION ALL SELECT CAST('2026-04-03' AS date)
          UNION ALL SELECT CAST('2026-04-21' AS date)
          UNION ALL SELECT CAST('2026-05-01' AS date)
          UNION ALL SELECT CAST('2026-06-04' AS date)
          UNION ALL SELECT CAST('2026-09-07' AS date)
          UNION ALL SELECT CAST('2026-10-12' AS date)
          UNION ALL SELECT CAST('2026-11-02' AS date)
          UNION ALL SELECT CAST('2026-11-15' AS date)
          UNION ALL SELECT CAST('2026-12-25' AS date)
      ),
      Dias AS (
          SELECT @dtInicioParam AS dtDia
          UNION ALL
          SELECT DATEADD(DAY, 1, dtDia)
          FROM Dias
          WHERE DATEADD(DAY, 1, dtDia) <= @dtFimParam
      ),
      DiasUteis AS (
          SELECT d.dtDia
          FROM Dias d
          LEFT JOIN Feriados f ON f.dtFeriado = d.dtDia
          WHERE DATENAME(WEEKDAY, d.dtDia) NOT IN ('Saturday', 'Sunday')
            AND f.dtFeriado IS NULL
      ),
      Vendedores AS (
          SELECT DISTINCT idVendedor, nmVendedor
          FROM dbo.fatAtividadesResumida
          WHERE dtInicial >= @dtInicioParam
            AND dtInicial < DATEADD(DAY, 1, @dtFimParam)
            AND (@idVendedorParam IS NULL OR idVendedor = @idVendedorParam)
      ),
      DiasSemRota AS (
          SELECT
              v.idVendedor,
              v.nmVendedor,
              COUNT(DISTINCT du.dtDia) AS diasSemRota
          FROM Vendedores v
          CROSS JOIN DiasUteis du
          LEFT JOIN dbo.fatAtividadesResumida a
              ON a.idVendedor = v.idVendedor
             AND CAST(a.dtInicial AS date) = du.dtDia
          WHERE a.idAtividade IS NULL
          GROUP BY v.idVendedor, v.nmVendedor
      ),
      AtividadesRuins AS (
          SELECT
              s.idVendedor,
              s.nmVendedor,
              s.idAtividade,
              s.dtInicial,
              s.nmAssunto,
              CASE 
                  WHEN LTRIM(RTRIM(ISNULL(d.nmDiagnostico, ''))) = '' THEN 'Sem Diagnóstico'
                  ELSE NULL
              END AS problemaD,
              CASE 
                  WHEN LTRIM(RTRIM(ISNULL(d.nmImagem, ''))) = '' THEN 'Sem Imagem'
                  ELSE NULL
              END AS problemaI
          FROM dbo.fatAtividadesApiA2WFreeSimples s
          LEFT JOIN dbo.fatAtividadesApiA2WFreeDiagnostico d 
              ON d.idAtividade = s.idAtividade
          WHERE s.idTipoAtividade = 730
            AND s.dtInicial >= @dtInicioParam
            AND s.dtInicial < DATEADD(DAY, 1, @dtFimParam)
            AND (
                LTRIM(RTRIM(ISNULL(d.nmDiagnostico, ''))) = ''
                OR LTRIM(RTRIM(ISNULL(d.nmImagem, ''))) = ''
            )
      ),
      ContagemAtivRuins AS (
          SELECT
              idVendedor,
              nmVendedor,
              COUNT(*) AS qtdeAtividadesRuins,
              COUNT(DISTINCT CAST(dtInicial AS date)) AS diasComAtivRuim
          FROM AtividadesRuins
          GROUP BY idVendedor, nmVendedor
      ),
      AtividadesPendentes AS (
          SELECT
              a.idVendedor,
              a.nmVendedor,
              a.idAtividade,
              a.dtInicial,
              a.nmCliente,
              a.tipoAtividade
          FROM dbo.fatAtividadesResumida a
          WHERE a.idStatus = 1
            AND a.dtInicial >= @dtInicioParam
            AND a.dtInicial < DATEADD(DAY, 1, @dtFimParam)
      ),
      ContagemPendentes AS (
          SELECT
              idVendedor,
              nmVendedor,
              COUNT(*) AS qtdeAtividadesPendentes,
              COUNT(DISTINCT CAST(dtInicial AS date)) AS diasComPendencia
          FROM AtividadesPendentes
          GROUP BY idVendedor, nmVendedor
      ),
      DiasUteisTotal AS (
          SELECT COUNT(*) AS totalDiasUteis FROM DiasUteis
      ),
      Pontuacao AS (
          SELECT
              v.idVendedor,
              v.nmVendedor,
              ISNULL(sr.diasSemRota, 0)           AS diasSemRota,
              ISNULL(ar.qtdeAtividadesRuins, 0)   AS qtdeAtividadesRuins,
              ISNULL(ar.diasComAtivRuim, 0)       AS diasComAtivRuim,
              ISNULL(ap.qtdeAtividadesPendentes, 0) AS qtdeAtividadesPendentes,
              ISNULL(ap.diasComPendencia, 0)      AS diasComPendencia,
              (ISNULL(sr.diasSemRota, 0) * 5)     AS pontosPerdidos_SemRota,
              ISNULL(ar.diasComAtivRuim, 0)       AS pontosPerdidos_AtivRuins,
              ISNULL(ap.diasComPendencia, 0)      AS pontosPerdidos_Pendentes
          FROM Vendedores v
          LEFT JOIN DiasSemRota sr       ON sr.idVendedor = v.idVendedor
          LEFT JOIN ContagemAtivRuins ar ON ar.idVendedor = v.idVendedor
          LEFT JOIN ContagemPendentes ap ON ap.idVendedor = v.idVendedor
      )
      SELECT
          @dtInicioParam AS periodoInicio,
          @dtFimParam    AS periodoFim,
          (SELECT totalDiasUteis FROM DiasUteisTotal) AS diasUteisNoPeriodo,

          p.idVendedor,
          p.nmVendedor,

          p.diasSemRota,
          p.pontosPerdidos_SemRota,

          p.qtdeAtividadesRuins,
          p.diasComAtivRuim,
          p.pontosPerdidos_AtivRuins,

          p.qtdeAtividadesPendentes,
          p.diasComPendencia,
          p.pontosPerdidos_Pendentes,

          (p.pontosPerdidos_SemRota +
           p.pontosPerdidos_AtivRuins +
           p.pontosPerdidos_Pendentes) AS totalPontosPerdidos,

          CASE 
              WHEN (100 - (p.pontosPerdidos_SemRota +
                          p.pontosPerdidos_AtivRuins +
                          p.pontosPerdidos_Pendentes)) < 0
              THEN 0
              ELSE 100 - (p.pontosPerdidos_SemRota +
                          p.pontosPerdidos_AtivRuins +
                          p.pontosPerdidos_Pendentes)
          END AS pontuacaoFinal,

          CASE 
              WHEN CASE 
                      WHEN (100 - (p.pontosPerdidos_SemRota +
                                  p.pontosPerdidos_AtivRuins +
                                  p.pontosPerdidos_Pendentes)) < 0
                      THEN 0
                      ELSE 100 - (p.pontosPerdidos_SemRota +
                                  p.pontosPerdidos_AtivRuins +
                                  p.pontosPerdidos_Pendentes)
                  END >= 90 THEN 'Excelente'
              WHEN CASE 
                      WHEN (100 - (p.pontosPerdidos_SemRota +
                                  p.pontosPerdidos_AtivRuins +
                                  p.pontosPerdidos_Pendentes)) < 0
                      THEN 0
                      ELSE 100 - (p.pontosPerdidos_SemRota +
                                  p.pontosPerdidos_AtivRuins +
                                  p.pontosPerdidos_Pendentes)
                  END >= 75 THEN 'Bom'
              WHEN CASE 
                      WHEN (100 - (p.pontosPerdidos_SemRota +
                                  p.pontosPerdidos_AtivRuins +
                                  p.pontosPerdidos_Pendentes)) < 0
                      THEN 0
                      ELSE 100 - (p.pontosPerdidos_SemRota +
                                  p.pontosPerdidos_AtivRuins +
                                  p.pontosPerdidos_Pendentes)
                  END >= 50 THEN 'Regular'
              ELSE 'Crítico'
          END AS classificacao

      FROM Pontuacao p
      ORDER BY
          pontuacaoFinal DESC,
          p.nmVendedor
      OPTION (MAXRECURSION 0);
    `;

    const result = await runQuery(sqlGamificacao, request => {
      request
        .input('dtInicio', sql.Date, inicio)
        .input('dtFim', sql.Date, fim)
        .input('idVendedor', sql.Int, idVendedorInt);
    });

    res.json({
      inicio,
      fim,
      vendedorId: idVendedorInt || null,
      gamificacao: result.recordset
    });
  } catch (e) {
    console.error('Erro GET /api/v1/gamificacao:', e);
    res.status(500).json({
      error: 'Erro ao calcular gamificação',
      detail: e.message
    });
  }
});

app.get('/api/v1/health', async (req, res) => {
  const status = {};

  status.ping = 'ok';

  try {
    const pool = await getPoolWithRetry();
    const r = await pool.request().query(`
      SELECT TOP 1 DB_NAME() AS db, SCHEMA_NAME() AS schemaName FROM sys.objects
    `);
    status.db = r.recordset.length > 0 ? 'ok' : 'sem dados';
  } catch (e) {
    status.db = 'erro: ' + e.message;
  }

  status.geocode = GOOGLE_KEY ? 'ok' : 'chave GEOCODING ausente';
  status.tomtom = TOMTOM_KEY ? 'ok' : 'chave TOMTOM_TRAFFIC_KEY ausente';

  try {
    const r = await runQuery(
      `
      SELECT TOP 1
        p.ParceiroCodigo,
        p.ParceiroNome
      FROM dbo.dimParceiroSkw p
      INNER JOIN dbo.fatVendas f
        ON f.ParceiroCodigo = p.ParceiroCodigo
       AND f.DataVenda >= DATEADD(YEAR, -3, CAST(GETDATE() AS date))
      WHERE p.ParceiroCodigo <> 0;
      `,
      () => {}
    );
    status.logistica_clientes = r.recordset.length > 0 ? 'ok' : 'sem dados';
  } catch (e) {
    status.logistica_clientes = 'erro: ' + e.message;
  }

  try {
    const r = await runQuery(
      `
      SELECT TOP 1 CODVEND, NOME_VENDEDOR
      FROM dbo.dimCarteiraSKW
      WHERE CODVEND IS NOT NULL AND CODVEND <> 0;
      `,
      () => {}
    );
    status.vendedores = r.recordset.length > 0 ? 'ok' : 'sem dados';
  } catch (e) {
    status.vendedores = 'erro: ' + e.message;
  }

  try {
    const r = await runQuery(
      `
      ${CTE_PARCEIRO_REGIAO}
      SELECT TOP 1 f.NUFIN
      FROM dbo.fatFinanceiroSkwReceita f
      LEFT JOIN ParceiroRegiao pr
        ON f.CODPARC = pr.ParceiroCodigo;
      `,
      () => {}
    );
    status.inadimplencia = r.recordset.length > 0 ? 'ok' : 'sem dados';
  } catch (e) {
    status.inadimplencia = 'erro: ' + e.message;
  }

  try {
    const r = await runQuery(
      `
      SELECT TOP 1
        c.CODVEND,
        c.CODPARC,
        p.ParceiroNome
      FROM dbo.dimCarteiraSKW c
      LEFT JOIN dbo.dimParceiroSkw p
        ON p.ParceiroCodigo = c.CODPARC;
      `,
      () => {}
    );
    status.carteira = r.recordset.length > 0 ? 'ok' : 'sem dados';
  } catch (e) {
    status.carteira = 'erro: ' + e.message;
  }

  try {
    const r = await runQuery(
      `
      SELECT TOP 1 IdDespesa
      FROM dbo.dimDespesasVisya;
      `,
      () => {}
    );
    status.despesas = r.recordset.length > 0 ? 'ok' : 'sem dados';
  } catch (e) {
    status.despesas = 'erro: ' + e.message;
  }

// 10) vendas (fatVendas)
try {
  const r = await runQuery(
    `
    SELECT TOP 1 ValorVenda
    FROM dbo.fatVendas;
    `,
    () => {}
  );
  status.vendas = r.recordset.length > 0 ? 'ok' : 'sem dados';
} catch (e) {
  status.vendas = 'erro: ' + e.message;
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
