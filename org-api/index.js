require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { getPool } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// ========= HELPERS DE AUDITORIA =========

function getUsuarioFromReq(req) {
  return (req.headers['x-usuario-email'] || '').toString();
}

async function logDespesa(pool, {
  operacao,
  usuarioEmail,
  idDespesa,
  empresa,
  antes,
  depois,
  detalhes
}) {
  try {
    const reqSql = pool.request()
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

// ================== TESTES SIMPLES ==================

// teste simples
app.get('/api/v1/ping', (req, res) => {
  res.json({ ok: true });
});

// teste de conexão com o banco
app.get('/api/v1/test-db', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT TOP 1 1 AS ok');
    res.json(result.recordset[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error', detail: e.message });
  }
});

// ================== DESPESAS ==================

// GET /api/v1/despesas?mes=YYYY-MM&empresa=linhagro
app.get('/api/v1/despesas', async (req, res) => {
  const mes = req.query.mes;                 // formato esperado: YYYY-MM
  const empresa = req.query.empresa || null; // opcional

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
    const dataFimDate = new Date(dataProxMes.getTime() - 24 * 60 * 60 * 1000);
    const dataFim = dataFimDate.toISOString().substring(0, 10); // YYYY-MM-DD

    const pool = await getPool();

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
        ? String(d.tipos_aviso).split(',').map(x => x.trim()).filter(Boolean)
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
    res.status(500).json({ error: 'Erro ao buscar despesas', detail: e.message });
  }
});

// POST /api/v1/despesas  (criar nova despesa)
app.post('/api/v1/despesas', async (req, res) => {
  try {
    const {
      empresa,
      descricao,
      data_vencimento,   // ISO string ou 'YYYY-MM-DD'
      status,
      recorrencia_tipo,
      tipos_aviso,       // array de strings, ex: ["7","3","0"]
      contatos           // array de { nome, telefone, tipo }
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

    const pool = await getPool();

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

    // log auditoria - CREATE
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
    res.status(500).json({ error: 'Erro ao criar despesa', detail: e.message });
  }
});

// PUT /api/v1/despesas/:id  (editar despesa existente)
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

    const pool = await getPool();

    // captura estado anterior
    const rsAntes = await pool.request()
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

    // log auditoria - UPDATE
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
        ? String(d.tipos_aviso).split(',').map(x => x.trim()).filter(Boolean)
        : ['3'],
      contatos: d.contatos_json ? JSON.parse(d.contatos_json) : []
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao atualizar despesa', detail: e.message });
  }
});

// DELETE /api/v1/despesas/:id  (remover despesa)
app.delete('/api/v1/despesas/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || id <= 0) {
      return res.status(400).json({ error: 'Id inválido.' });
    }

    const pool = await getPool();

    // captura estado anterior
    const rsAntes = await pool.request()
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

    const rows = result.rowsAffected && result.rowsAffected[0] ? result.rowsAffected[0] : 0;

    if (rows === 0) {
      return res.status(404).json({ error: 'Despesa não encontrada.' });
    }

    // log auditoria - DELETE
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
    console.error(e);
    res.status(500).json({ error: 'Erro ao excluir despesa', detail: e.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('API rodando na porta ' + port));
