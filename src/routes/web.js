const express = require('express');
const router = express.Router();
const { addProduct, listProducts, listProductsByUnit, listExchanges, getProductFromCatalog, addProductToCatalog } = require('../storage');
const { isValidDateString, parseDate, daysUntil } = require('../utils/dates');
const { runNotificationJob, sendAlertsToMember, buildAlertPayload } = require('../scheduler/notify');
const { getUnitOptions, getUnitById, getAllUnits } = require('../config/unitsHelper');
const slackAppModule = require('../slack/app');

// Senha do admin
const ADMIN_PASSWORD = '333399';

// Helper para parse de cookies
function parseCookies(req) {
  const cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      cookies[name] = decodeURIComponent(value);
    });
  }
  return cookies;
}

// Página inicial - Seleção de Unidade
router.get('/', (req, res) => {
  const cookies = parseCookies(req);
  const savedUnit = cookies.unidade;

  // Se já tem unidade salva, redireciona para o cadastro
  if (savedUnit && getUnitById(savedUnit)) {
    return res.redirect('/cadastro');
  }

  const unitOptions = getUnitOptions();
  const unitCardsHtml = unitOptions.map(u => `
    <a href="/selecionar-unidade?unidade=${u.id}" class="unit-card">
      <div class="unit-icon">🏪</div>
      <div class="unit-name">${u.name}</div>
    </a>
  `).join('');

  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="theme-color" content="#006837">
    <title>Selecione sua Unidade — O Boticário</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/public/style.css">
    <style>
      .unit-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 16px;
        margin-top: 24px;
      }
      .unit-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 24px 16px;
        background: #fff;
        border: 2px solid #e0e0e0;
        border-radius: 12px;
        text-decoration: none;
        color: #333;
        transition: all 0.2s ease;
      }
      .unit-card:hover {
        border-color: #006837;
        background: #f0fdf4;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,104,55,0.15);
      }
      .unit-icon {
        font-size: 48px;
        margin-bottom: 12px;
      }
      .unit-name {
        font-weight: 600;
        text-align: center;
        font-size: 14px;
      }
      .welcome-text {
        text-align: center;
        margin-bottom: 8px;
      }
      .subtitle {
        text-align: center;
        color: #666;
        margin-bottom: 24px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header" style="text-align:center">
        <div class="logo" aria-hidden="true" style="margin:0 auto 16px">
          <img src="/public/logo.png" alt="Logo da empresa" class="logo-img">
        </div>
        <h1 class="welcome-text">Bem-vindo!</h1>
        <p class="subtitle">Selecione sua unidade para continuar</p>
      </div>

      <div class="card">
        <div class="unit-grid">
          ${unitCardsHtml}
        </div>
      </div>

      <p style="text-align:center;margin-top:24px;font-size:13px;color:#888">
        <a href="/admin-login" style="color:#666;text-decoration:none">Área administrativa</a>
      </p>
    </div>
  </body>
  </html>
  `;
  res.send(html);
});

// Selecionar unidade e salvar cookie
router.get('/selecionar-unidade', (req, res) => {
  const { unidade } = req.query;

  if (!unidade || !getUnitById(unidade)) {
    return res.redirect('/');
  }

  // Salva cookie por 30 dias
  res.setHeader('Set-Cookie', `unidade=${encodeURIComponent(unidade)}; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Lax`);
  res.redirect('/cadastro');
});

// Trocar unidade
router.get('/trocar-unidade', (req, res) => {
  // Remove o cookie
  res.setHeader('Set-Cookie', 'unidade=; Path=/; Max-Age=0');
  res.redirect('/');
});

// Página de Cadastro (precisa ter unidade selecionada)
router.get('/cadastro', (req, res) => {
  const cookies = parseCookies(req);
  const unidade = cookies.unidade;

  if (!unidade || !getUnitById(unidade)) {
    return res.redirect('/');
  }

  const unit = getUnitById(unidade);

  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="theme-color" content="#006837">
    <title>Cadastro de Demonstrador — ${unit.name}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
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
            <p class="lead">Unidade: <strong>${unit.name}</strong> · <a href="/trocar-unidade" style="color:#006837;font-size:13px">Trocar unidade</a></p>
            <p style="margin-top:8px"><a href="/items?unidade=${unidade}" style="color:#006837;font-weight:600;text-decoration:none">Ver itens da minha unidade</a></p>
        </div>
      </div>

      <div class="card">
        <form id="productForm" aria-describedby="formHelp">
          <input type="hidden" id="unidade" name="unidade" value="${unidade}">
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

            <div class="field full">
              <label for="validade">Validade</label>
              <input id="validade" name="validade" type="date" required aria-required="true">
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

// Processar POST de cadastro
router.post('/add', express.urlencoded({ extended: true }), async (req, res) => {
  const { sku, nome, validade, unidade } = req.body;

  if (!sku || !nome || !validade || !unidade) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ ok: false, message: 'Preencha todos os campos.' });
    }
    return res.status(400).send('<h3 class="error">Preencha todos os campos. <a href="/cadastro">Voltar</a></h3>');
  }

  if (!isValidDateString(validade)) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ ok: false, message: 'Data inválida.' });
    }
    return res.status(400).send('<h3 class="error">Data inválida. <a href="/cadastro">Voltar</a></h3>');
  }

  const unit = getUnitById(unidade);
  if (!unit) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ ok: false, message: 'Unidade inválida.' });
    }
    return res.status(400).send('<h3 class="error">Unidade inválida. <a href="/">Voltar</a></h3>');
  }

  try {
    await addProduct({ sku, nome, validade, unidade });

    // Salva também no catálogo (estoque.csv) se for um produto novo
    const existsInCatalog = getProductFromCatalog(sku);
    if (!existsInCatalog) {
      addProductToCatalog({ sku, nome });
    }

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ ok: true, message: 'Produto cadastrado com sucesso!' });
    }
    res.send('<h3 class="success">Produto cadastrado com sucesso! <a href="/cadastro">Cadastrar outro</a></h3>');
  } catch (err) {
    console.error(err);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ ok: false, message: 'Erro interno ao salvar.' });
    }
    res.status(500).send('<h3 class="error">Erro interno ao salvar.</h3>');
  }
});

// Lista de itens com filtro por unidade
router.get('/items', async (req, res) => {
  const cookies = parseCookies(req);
  const unidadeFromCookie = cookies.unidade;
  const { unidade } = req.query;

  // Se não tem unidade na query, usa a do cookie
  const selectedUnidade = unidade || unidadeFromCookie;
  const unitOptions = getUnitOptions();

  let products;
  if (selectedUnidade) {
    products = await listProductsByUnit(selectedUnidade);
  } else {
    products = await listProducts();
  }

  const selectedUnit = selectedUnidade ? getUnitById(selectedUnidade) : null;
  const unitOptionsHtml = unitOptions.map(u =>
    `<option value="${u.id}" ${selectedUnidade === u.id ? 'selected' : ''}>${u.name}</option>`
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
      <a href="/cadastro" style="display:inline-block;margin-bottom:12px;color:#006837;text-decoration:none">← Voltar ao cadastro</a>
      <h2>Itens Cadastrados (${products.length})${selectedUnit ? ` — ${selectedUnit.name}` : ''}</h2>

      <div class="filter-bar">
        <label for="unitFilter">Filtrar por unidade:</label>
        <select id="unitFilter" onchange="window.location.href='/items?unidade='+this.value">
          <option value="">Todas as unidades</option>
          ${unitOptionsHtml}
        </select>
        ${selectedUnidade ? '<a href="/items?unidade=">Limpar filtro</a>' : ''}
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

// ==================== API DO CATÁLOGO ====================

// Buscar produto no catálogo pelo SKU
router.get('/api/catalog/:sku', (req, res) => {
  const { sku } = req.params;
  const product = getProductFromCatalog(sku);
  if (product) {
    res.json({ found: true, nome: product.nome });
  } else {
    res.json({ found: false });
  }
});

// ==================== ÁREA ADMINISTRATIVA ====================

// Tela de login do admin
router.get('/admin-login', (req, res) => {
  const { error } = req.query;

  const html = `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Login — Área Administrativa</title>
      <link rel="stylesheet" href="/public/style.css">
      <style>
        body{font-family:Inter,Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5}
        .login-box{background:#fff;padding:32px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);width:100%;max-width:360px}
        .login-box h2{margin:0 0 24px;text-align:center;color:#006837}
        .login-box input{width:100%;padding:12px;border:1px solid #ddd;border-radius:6px;font-size:16px;margin-bottom:16px;box-sizing:border-box}
        .login-box button{width:100%;padding:12px;background:#006837;color:#fff;border:none;border-radius:6px;font-size:16px;cursor:pointer}
        .login-box button:hover{background:#005530}
        .error-msg{background:#ffebee;color:#c62828;padding:12px;border-radius:6px;margin-bottom:16px;text-align:center;font-size:14px}
        .back-link{display:block;text-align:center;margin-top:16px;color:#666;text-decoration:none;font-size:14px}
      </style>
    </head>
    <body>
      <div class="login-box">
        <h2>Área Administrativa</h2>
        ${error ? '<div class="error-msg">Senha incorreta</div>' : ''}
        <form method="POST" action="/admin-login">
          <input type="password" name="senha" placeholder="Digite a senha" required autofocus>
          <button type="submit">Entrar</button>
        </form>
        <a href="/" class="back-link">← Voltar</a>
      </div>
    </body>
  </html>
  `;
  res.send(html);
});

// Processar login do admin
router.post('/admin-login', express.urlencoded({ extended: true }), (req, res) => {
  const { senha } = req.body;

  if (senha === ADMIN_PASSWORD) {
    // Salva cookie de sessão admin (expira em 8 horas)
    res.setHeader('Set-Cookie', `admin_session=authenticated; Path=/; Max-Age=${8 * 60 * 60}; SameSite=Lax`);
    res.redirect('/admin');
  } else {
    res.redirect('/admin-login?error=1');
  }
});

// Logout do admin
router.get('/admin-logout', (req, res) => {
  res.setHeader('Set-Cookie', 'admin_session=; Path=/; Max-Age=0');
  res.redirect('/admin-login');
});

// Middleware para verificar autenticação admin
function requireAdminAuth(req, res, next) {
  const cookies = parseCookies(req);
  if (cookies.admin_session === 'authenticated') {
    next();
  } else {
    res.redirect('/admin-login');
  }
}

// Rota administrativa (protegida por senha)
router.get('/admin', requireAdminAuth, async (req, res) => {
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
    const options = { timeZone: 'America/Maceio', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    return `
    <tr>
      <td>${e.sku}</td>
      <td>${e.produtoNome || '-'}</td>
      <td>${unit ? unit.name : e.unidade}</td>
      <td>${e.userName}</td>
      <td>${new Date(e.clickedAt).toLocaleString('pt-BR', options)}</td>
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
          .header-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
          .logout-btn{background:#dc3545;padding:6px 12px;font-size:13px}
        </style>
      </head>
      <body>
        <div class="header-bar">
          <a href="/" style="color:#006837;text-decoration:none">← Voltar ao site</a>
          <a href="/admin-logout" class="logout-btn" style="background:#dc3545;color:#fff;padding:6px 12px;border-radius:6px;text-decoration:none;font-size:13px">Sair</a>
        </div>

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

router.post('/admin/notify', requireAdminAuth, async (req, res) => {
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

router.post('/admin/test', requireAdminAuth, express.json(), async (req, res) => {
  const { app } = slackAppModule;
  const user = (req.body && req.body.user) || 'U0895CZ8HU7';
  const unidade = (req.body && req.body.unidade) || 'vd-palmeira';

  if (!app) return res.status(400).json({ ok: false, message: 'Slack App não configurado.' });

  try {
    const products = await listProductsByUnit(unidade);
    const items = products.filter(p => {
      const expiryDate = parseDate(p.VALIDADE);
      return daysUntil(expiryDate) === 7;
    });

    if (items.length === 0) {
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
