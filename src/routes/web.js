const express = require('express');
const router = express.Router();
const { addProduct, listProducts, listProductsByUnit, listExchanges } = require('../storage');
const { isValidDateString, parseDate, daysUntil } = require('../utils/dates');
const { runNotificationJob, sendAlertsToMember, buildAlertPayload } = require('../scheduler/notify');
const { getUnitOptions, getUnitById, getAllUnits } = require('../config/unitsHelper');
const slackAppModule = require('../slack/app');

// Página com Formulário
router.get('/', (req, res) => {
  const unitOptions = getUnitOptions();
  const unitOptionsHtml = unitOptions.map(u => `<option value="${u.id}">${u.name}</option>`).join('');

  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="theme-color" content="#006837">
    <title>Cadastro de Demonstrador — O Boticário</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
    <link rel="icon" href="data:image/svg+xml;utf8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='64'%20height='64'%3E%3Crect%20fill='%23006837'%20rx='12'%20width='100%25'%20height='100%25'/%3E%3Ctext%20x='50%25'%20y='55%25'%20font-family='Inter,Arial'%20font-size='28'%20fill='white'%20text-anchor='middle'%3EOB%3C/text%3E%3C/svg%3E">
    <link rel="stylesheet" href="/public/style.css">
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="logo" aria-hidden="true">
          <img src="/public/logo.png" alt="Logo da empresa" class="logo-img">
        </div>
        <div>
            <h1>Cadastro de Demonstrador</h1>
            <p class="lead">Adicione produtos e informe a unidade para receber notificações no Slack.</p>
            <p style="margin-top:8px"><a href="/items" style="color:#006837;font-weight:600;text-decoration:none">Ver todos os itens cadastrados</a> &nbsp;·&nbsp; <a href="/admin" style="color:#006837;text-decoration:none">Área administrativa</a></p>
        </div>
      </div>

      <div class="card">
        <form id="productForm" aria-describedby="formHelp">
          <fieldset style="border:0;padding:0;margin:0;">
            <legend class="full" style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px">Cadastrar Demonstrador</legend>

            <div class="field">
              <label for="sku">SKU</label>
              <input id="sku" name="sku" required placeholder="Ex: 123456" inputmode="numeric" aria-required="true">
            </div>

            <div class="field">
              <label for="nome">Nome / Descrição</label>
              <input id="nome" name="nome" required placeholder="Ex: Batom Vermelho" aria-required="true">
            </div>

            <div class="field">
              <label for="validade">Validade</label>
              <input id="validade" name="validade" type="date" required aria-required="true">
            </div>

            <div class="field">
              <label for="unidade">Unidade</label>
              <select id="unidade" name="unidade" required aria-required="true">
                <option value="">-- selecione a unidade --</option>
                ${unitOptionsHtml}
              </select>
            </div>

            <div class="full">
              <p id="formHelp" class="note">Selecione a unidade onde o demonstrador está localizado.</p>
            </div>

            <div class="full actions">
              <button type="button" class="secondary" id="resetBtn">Limpar</button>
              <button type="submit" id="submitBtn" aria-live="polite">Salvar</button>
            </div>
          </fieldset>

          <div id="resp" class="full" role="status" aria-live="polite"></div>
        </form>
      </div>
    </div>

    <script src="/public/app.js" defer></script>
  </body>
  </html>
  `;
  res.send(html);
});

// Processar POST
router.post('/add', express.urlencoded({ extended: true }), async (req, res) => {
  const { sku, nome, validade, unidade } = req.body;

  if (!sku || !nome || !validade || !unidade) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ ok: false, message: 'Preencha todos os campos.' });
    }
    return res.status(400).send('<h3 class="error">Preencha todos os campos. <a href="/">Voltar</a></h3>');
  }

  if (!isValidDateString(validade)) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ ok: false, message: 'Data inválida.' });
    }
    return res.status(400).send('<h3 class="error">Data inválida. <a href="/">Voltar</a></h3>');
  }

  // Valida unidade
  const unit = getUnitById(unidade);
  if (!unit) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ ok: false, message: 'Unidade inválida.' });
    }
    return res.status(400).send('<h3 class="error">Unidade inválida. <a href="/">Voltar</a></h3>');
  }

  try {
    await addProduct({ sku, nome, validade, unidade });
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ ok: true, message: 'Produto cadastrado com sucesso!' });
    }
    res.send('<h3 class="success">Produto cadastrado com sucesso! <a href="/">Cadastrar outro</a></h3>');
  } catch (err) {
    console.error(err);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ ok: false, message: 'Erro interno ao salvar.' });
    }
    res.status(500).send('<h3 class="error">Erro interno ao salvar.</h3>');
  }
});

// Lista pública de itens cadastrados com filtro por unidade
router.get('/items', async (req, res) => {
  const { unidade } = req.query;
  const unitOptions = getUnitOptions();

  let products;
  if (unidade) {
    products = await listProductsByUnit(unidade);
  } else {
    products = await listProducts();
  }

  const selectedUnit = unidade ? getUnitById(unidade) : null;
  const unitOptionsHtml = unitOptions.map(u =>
    `<option value="${u.id}" ${unidade === u.id ? 'selected' : ''}>${u.name}</option>`
  ).join('');

  const rows = products.map(p => {
    const unit = getUnitById(p.UNIDADE);
    return `
    <tr>
      <td>${p.SKU}</td>
      <td>${p.NOME}</td>
      <td>${p.VALIDADE}</td>
      <td>${unit ? unit.name : p.UNIDADE || '-'}</td>
    </tr>
  `;
  }).join('');

  const html = `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Itens Cadastrados${selectedUnit ? ` — ${selectedUnit.name}` : ''}</title>
      <link rel="stylesheet" href="/public/style.css">
      <style>
        body{font-family:Inter,Arial,Helvetica,sans-serif;padding:18px}
        table{border-collapse:collapse;width:100%}
        td,th{border:1px solid #e6e6e6;padding:8px}
        th{background:#f7faf9;text-align:left}
        .filter-bar{margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
        .filter-bar select{padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px}
        .filter-bar a{color:#006837;text-decoration:none;font-size:14px}
      </style>
    </head>
    <body>
      <a href="/" style="display:inline-block;margin-bottom:12px;color:#006837;text-decoration:none">← Voltar ao cadastro</a>
      <h2>Itens Cadastrados (${products.length})${selectedUnit ? ` — ${selectedUnit.name}` : ''}</h2>

      <div class="filter-bar">
        <label for="unitFilter">Filtrar por unidade:</label>
        <select id="unitFilter" onchange="window.location.href='/items?unidade='+this.value">
          <option value="">Todas as unidades</option>
          ${unitOptionsHtml}
        </select>
        ${unidade ? '<a href="/items">Limpar filtro</a>' : ''}
      </div>

      <table>
        <thead><tr><th>SKU</th><th>Nome</th><th>Validade</th><th>Unidade</th></tr></thead>
        <tbody>
          ${rows || '<tr><td colspan="4" style="text-align:center;color:#666">Nenhum item cadastrado</td></tr>'}
        </tbody>
      </table>
    </body>
  </html>
  `;

  res.send(html);
});

// Rota administrativa
router.get('/admin', async (req, res) => {
  const products = await listProducts();
  const exchanges = await listExchanges();

  const productRows = products.map(p => {
    const unit = getUnitById(p.UNIDADE);
    return `
    <tr>
      <td>${p.SKU}</td>
      <td>${p.NOME}</td>
      <td>${p.VALIDADE}</td>
      <td>${unit ? unit.name : p.UNIDADE || '-'}</td>
    </tr>
  `;
  }).join('');

  const exchangeRows = exchanges.map(e => {
    const unit = getUnitById(e.unidade);
    return `
    <tr>
      <td>${e.sku}</td>
      <td>${e.produtoNome || '-'}</td>
      <td>${unit ? unit.name : e.unidade}</td>
      <td>${e.userName}</td>
      <td>${new Date(e.clickedAt).toLocaleString('pt-BR')}</td>
    </tr>
  `;
  }).join('');

  const unitOptions = getAllUnits().map(u => `<option value="${u.id}">${u.name}</option>`).join('');

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Admin — Produtos</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;padding:20px}
          table{border-collapse:collapse;width:100%;margin-bottom:24px}
          td,th{border:1px solid #e6e6e6;padding:8px}
          th{background:#f7faf9;text-align:left}
          button{padding:8px 12px;background:#006837;color:#fff;border:none;border-radius:6px;cursor:pointer}
          .section{margin-top:32px}
          .test-box{background:#f5f5f5;padding:16px;border-radius:8px;margin-top:16px}
          .test-box input, .test-box select{padding:6px 8px;border:1px solid #ddd;border-radius:6px;margin-right:8px}
        </style>
      </head>
      <body>
        <a href="/" style="display:inline-block;margin-bottom:12px;color:#006837;text-decoration:none">← Voltar</a>
        <h2>Produtos cadastrados (${products.length})</h2>
        <p>
          <button id="trigger">Disparar notificações agora</button>
        </p>
        <table>
          <thead><tr><th>SKU</th><th>Nome</th><th>Validade</th><th>Unidade</th></tr></thead>
          <tbody>
            ${productRows || '<tr><td colspan="4">Nenhum produto</td></tr>'}
          </tbody>
        </table>

        <div class="test-box">
          <h4>Enviar mensagem de teste</h4>
          <p>
            <label>Unidade:</label>
            <select id="testUnidade">
              ${unitOptions}
            </select>
            <label style="margin-left:12px">Slack ID (destino):</label>
            <input id="testUser" placeholder="U0895CZ8HU7" value="U0895CZ8HU7">
            <button id="testBtn" style="background:#0f6f4f">Enviar teste</button>
          </p>
        </div>

        <div class="section">
          <h3>Trocas registradas (${exchanges.length})</h3>
          <table>
            <thead><tr><th>SKU</th><th>Produto</th><th>Unidade</th><th>Trocado por</th><th>Data/Hora</th></tr></thead>
            <tbody>
              ${exchangeRows || '<tr><td colspan="5">Nenhuma troca registrada</td></tr>'}
            </tbody>
          </table>
        </div>

        <div id="resp" style="margin-top:12px;padding:12px;background:#e8f5e9;border-radius:6px;display:none"></div>

        <script>
          const respEl = document.getElementById('resp');
          function showResp(msg, isError) {
            respEl.textContent = msg;
            respEl.style.display = 'block';
            respEl.style.background = isError ? '#ffebee' : '#e8f5e9';
          }

          document.getElementById('trigger').addEventListener('click', async () => {
            showResp('Executando...');
            try {
              const r = await fetch('/admin/notify', { method: 'POST' });
              const j = await r.json();
              showResp(j.message || JSON.stringify(j), !j.ok);
            } catch (err) {
              showResp('Erro: ' + err.message, true);
            }
          });

          document.getElementById('testBtn').addEventListener('click', async () => {
            const user = document.getElementById('testUser').value.trim() || 'U0895CZ8HU7';
            const unidade = document.getElementById('testUnidade').value;
            showResp('Enviando teste para ' + user + '...');
            try {
              const r = await fetch('/admin/test', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ user, unidade })
              });
              const j = await r.json();
              showResp(j.message || JSON.stringify(j), !j.ok);
            } catch (err) {
              showResp('Erro: ' + err.message, true);
            }
          });
        </script>
      </body>
    </html>
  `;

  res.send(html);
});

router.post('/admin/notify', async (req, res) => {
  const { app } = slackAppModule;
  if (!app) {
    return res.status(400).json({ ok: false, message: 'Slack App não está configurado (cheque variáveis de ambiente).' });
  }

  try {
    await runNotificationJob(app);
    res.json({ ok: true, message: 'Job de notificação executado (ver logs para detalhes).' });
  } catch (err) {
    console.error('Erro ao executar job manualmente:', err);
    res.status(500).json({ ok: false, message: 'Erro ao executar job.' });
  }
});

// Envia mensagem de teste para um usuário
router.post('/admin/test', express.json(), async (req, res) => {
  const { app } = slackAppModule;
  const user = (req.body && req.body.user) || 'U0895CZ8HU7';
  const unidade = (req.body && req.body.unidade) || 'vd-palmeira';

  if (!app) return res.status(400).json({ ok: false, message: 'Slack App não configurado.' });

  try {
    // Busca produtos da unidade que vencem em 7 dias
    const products = await listProductsByUnit(unidade);
    const items = products.filter(p => {
      const expiryDate = parseDate(p.VALIDADE);
      return daysUntil(expiryDate) === 7;
    });

    if (items.length === 0) {
      // Se não houver itens, envia uma mensagem de preview com um exemplo
      const example = [{
        SKU: '0000',
        NOME: 'Exemplo Produto',
        VALIDADE: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0,10),
        UNIDADE: unidade
      }];
      await sendAlertsToMember(app, user, example, unidade);
      return res.json({ ok: true, message: 'Preview enviado (exemplo) — não havia itens com 7 dias para essa unidade.' });
    }

    await sendAlertsToMember(app, user, items, unidade);
    return res.json({ ok: true, message: `Mensagem de alerta enviada para ${user} com ${items.length} item(ns).` });
  } catch (err) {
    console.error('Erro ao enviar teste:', err?.data?.error || err.message || err);
    return res.status(500).json({ ok: false, message: 'Falha ao enviar mensagem de teste.' });
  }
});

module.exports = router;
