const express = require('express');
const router = express.Router();
const { addProduct } = require('../storage/csvStore');
const { isValidDateString } = require('../utils/dates');
const { listProducts } = require('../storage/csvStore');
const { runNotificationJob, sendAlertsToManager } = require('../scheduler/notify');
const { parseDate, daysUntil } = require('../utils/dates');
const slackAppModule = require('../slack/app');

// Apply body parsing only where needed to avoid interfering with
// Slack's signature verification on the `/slack/events` endpoint
// (ExpressReceiver expects the raw body for verification).

// Página com Formulário
router.get('/', (req, res) => {
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
          <p class="lead">Adicione produtos e informe o gerente para receber notificações no Slack.</p>
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
              <label for="managerId">Slack Member ID do Gerente</label>
              <input id="managerId" name="managerId" required placeholder="U0123ABC" aria-required="true">
            </div>

            <div class="full">
              <p id="formHelp" class="note">Dica: copie o Slack Member ID no perfil do gerente (Copiar ID).</p>
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
router.post('/add', express.urlencoded({ extended: true }), (req, res) => {
  const { sku, nome, validade, managerId } = req.body;

  if (!sku || !nome || !validade || !managerId) {
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

  try {
    addProduct({ sku, nome, validade, managerId });
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

module.exports = router;

// Rota administrativa simples (lista produtos e permite disparar notificações manualmente)
router.get('/admin', (req, res) => {
  const products = listProducts();
  const rows = products.map(p => `
    <tr>
      <td>${p.SKU}</td>
      <td>${p.NOME}</td>
      <td>${p.VALIDADE}</td>
      <td>${p.MANAGER_ID}</td>
    </tr>
  `).join('');

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Admin — Produtos</title>
        <style>body{font-family:Arial,Helvetica,sans-serif;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #e6e6e6;padding:8px}button{padding:8px 12px;background:#006837;color:#fff;border:none;border-radius:6px;cursor:pointer}</style>
      </head>
      <body>
        <h2>Produtos cadastrados</h2>
        <p>
          <button id="trigger">Disparar notificações agora</button>
          &nbsp;
          <input id="testUser" placeholder="U0895CZ8HU7" value="U0895CZ8HU7" style="padding:6px 8px;border:1px solid #ddd;border-radius:6px;margin-left:8px">
          <button id="testBtn" style="margin-left:6px;padding:6px 10px;background:#0f6f4f;color:#fff;border:none;border-radius:6px;cursor:pointer">Enviar teste</button>
        </p>
        <table>
          <thead><tr><th>SKU</th><th>Nome</th><th>Validade</th><th>Manager ID</th></tr></thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div id="resp" style="margin-top:12px"></div>
        <script>
          const respEl = document.getElementById('resp');
          document.getElementById('trigger').addEventListener('click', async () => {
            respEl.textContent = 'Executando...';
            try {
              const r = await fetch('/admin/notify', { method: 'POST' });
              const j = await r.json();
              respEl.textContent = j.message || JSON.stringify(j);
            } catch (err) {
              respEl.textContent = 'Erro: ' + err.message;
            }
          });

          document.getElementById('testBtn').addEventListener('click', async () => {
            const user = document.getElementById('testUser').value.trim() || 'U0895CZ8HU7';
            respEl.textContent = 'Enviando teste para ' + user + '...';
            try {
              const r = await fetch('/admin/test', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ user }) });
              const j = await r.json();
              respEl.textContent = j.message || JSON.stringify(j);
            } catch (err) {
              respEl.textContent = 'Erro: ' + err.message;
            }
          });
        </script>
      </body>
    </html>
  `;

  res.send(html);
});

router.post('/admin/notify', async (req, res) => {
  const { app } = slackAppModule; // pode ser null se não configurado
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

// Envia mensagem de teste para um usuário (body: { user: 'U0...' })
router.post('/admin/test', express.json(), async (req, res) => {
  const { app } = slackAppModule;
  const user = (req.body && req.body.user) || req.query.user || 'U0895CZ8HU7';

  if (!app) return res.status(400).json({ ok: false, message: 'Slack App não configurado.' });

  try {
    // Seleciona produtos que para o gerente que vencem em 7 dias
    const products = listProducts();
    const items = products.filter(p => {
      const expiryDate = parseDate(p.VALIDADE);
      return daysUntil(expiryDate) === 7 && p.MANAGER_ID === user;
    });

    if (items.length === 0) {
      // Se não houver itens, envia uma mensagem de preview com um exemplo
      const example = [{ SKU: '0000', NOME: 'Exemplo Produto', VALIDADE: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0,10) }];
      await sendAlertsToManager(app, user, example);
      return res.json({ ok: true, message: 'Preview enviado (exemplo) — não havia itens com 7 dias para esse gerente.' });
    }

    await sendAlertsToManager(app, user, items);
    return res.json({ ok: true, message: `Mensagem de alerta enviada para ${user} com ${items.length} item(ns).` });
  } catch (err) {
    console.error('Erro ao enviar teste:', err && (err.data && err.data.error) || err.message || err);
    return res.status(500).json({ ok: false, message: 'Falha ao enviar mensagem de teste.' });
  }
});