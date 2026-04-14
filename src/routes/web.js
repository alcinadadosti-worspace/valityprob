const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { addProduct, listProducts, listProductsByUnit, listExchanges, getProductFromCatalog, addProductToCatalog, deleteProduct } = require('../storage');
const { isValidDateString, parseDate, daysUntil } = require('../utils/dates');
const { runNotificationJob, sendAlertsToMember, buildAlertPayload } = require('../scheduler/notify');
const { getUnitOptions, getUnitById, getAllUnits } = require('../config/unitsHelper');
const slackAppModule = require('../slack/app');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Senha do admin
const ADMIN_PASSWORD = '333399';

// Helper para gerar meta tags PWA
function getPWAMetaTags() {
  return `
    <link rel="manifest" href="/manifest.json">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Validade">
    <link rel="apple-touch-icon" href="/public/logo.png">
    <link rel="icon" type="image/png" href="/public/logo.png">
  `;
}

// Script para registrar o service worker
function getServiceWorkerScript() {
  return `
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.log('SW registration failed:', err));
        });
      }
    </script>
  `;
}

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
    <a href="/autenticar-unidade?unidade=${u.id}" class="unit-card">
      <div class="unit-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      </div>
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
    <title>Selecione sua Unidade</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/public/style.css">
    ${getPWAMetaTags()}
  </head>
  <body>
    <div class="container container--narrow">
      <div class="header header--centered">
        <div class="logo">
          <img src="/public/logo.png" alt="Logo" class="logo-img">
        </div>
        <div class="header-content">
          <h1 class="header-title">Controle de Validade</h1>
          <p class="header-subtitle">Selecione sua unidade para continuar</p>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="unit-grid">
            ${unitCardsHtml}
          </div>
        </div>
      </div>

      <p class="text-center text-muted text-small mt-6">
        <a href="/admin-login" class="header-link" style="opacity:0.6">Acessar painel administrativo</a>
      </p>
    </div>
    ${getServiceWorkerScript()}
  </body>
  </html>
  `;
  res.send(html);
});

// Página de autenticação da unidade
router.get('/autenticar-unidade', (req, res) => {
  const { unidade, error } = req.query;
  const unit = getUnitById(unidade);

  if (!unidade || !unit) {
    return res.redirect('/');
  }

  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="theme-color" content="#006837">
    <title>Autenticar — ${unit.name}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/public/style.css">
    ${getPWAMetaTags()}
  </head>
  <body class="login-container">
    <div class="login-box">
      <div class="card">
        <div class="card-body">
          <div class="login-header">
            <div class="logo">
              <img src="/public/logo.png" alt="Logo" class="logo-img">
            </div>
            <h1 class="login-title">${unit.name}</h1>
            <p class="login-subtitle">Digite o codigo da unidade para acessar</p>
          </div>

          ${error ? '<div class="message message--error mb-4">Codigo incorreto. Tente novamente.</div>' : ''}

          <form method="POST" action="/autenticar-unidade">
            <input type="hidden" name="unidade" value="${unidade}">
            <div class="form-field mb-4">
              <label for="codigo" class="form-label">Codigo da Unidade</label>
              <input type="password" id="codigo" name="codigo" class="form-input" placeholder="Digite o codigo" required autofocus inputmode="numeric" pattern="[0-9]*">
            </div>
            <button type="submit" class="btn btn--primary" style="width:100%">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                <polyline points="10 17 15 12 10 7"></polyline>
                <line x1="15" y1="12" x2="3" y2="12"></line>
              </svg>
              Entrar
            </button>
          </form>

          <p class="text-center text-muted text-small mt-4">
            <a href="/" class="header-link">Escolher outra unidade</a>
          </p>
        </div>
      </div>
    </div>
    ${getServiceWorkerScript()}
  </body>
  </html>
  `;
  res.send(html);
});

// Processar autenticação da unidade
router.post('/autenticar-unidade', express.urlencoded({ extended: true }), (req, res) => {
  const { unidade, codigo } = req.body;
  const unit = getUnitById(unidade);

  if (!unidade || !unit) {
    return res.redirect('/');
  }

  // Verifica se o código está correto
  if (codigo === unit.code) {
    // Salva cookie por 30 dias
    res.setHeader('Set-Cookie', `unidade=${encodeURIComponent(unidade)}; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Lax`);
    return res.redirect('/cadastro');
  } else {
    // Código incorreto
    return res.redirect(`/autenticar-unidade?unidade=${unidade}&error=1`);
  }
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
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/public/style.css">
    ${getPWAMetaTags()}
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="logo">
          <img src="/public/logo.png" alt="Logo" class="logo-img">
        </div>
        <div class="header-content">
          <h1 class="header-title">Cadastro de Demonstrador</h1>
          <p class="header-subtitle">
            ${unit.name}
            <span style="margin:0 6px;opacity:0.3">|</span>
            <a href="/trocar-unidade" class="header-link">Trocar</a>
          </p>
        </div>
      </div>

      <!-- Abas -->
      <div class="tab-bar">
        <button class="tab-btn tab-btn--active" id="tab-btn-individual" onclick="switchTab('individual')">Item Individual</button>
        <button class="tab-btn" id="tab-btn-planilha" onclick="switchTab('planilha')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:5px">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <line x1="8" y1="9" x2="10" y2="9"></line>
          </svg>
          Importar Planilha
        </button>
      </div>

      <!-- Painel: Item Individual -->
      <div id="pane-individual" class="tab-pane tab-pane--active">
        <div class="card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <span class="card-header-title">Novo Cadastro</span>
            <a href="/items?unidade=${unidade}" class="header-link text-small" style="text-transform:none;letter-spacing:0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
              Ver itens cadastrados
            </a>
          </div>
          <div class="card-body">
            <form id="productForm">
              <input type="hidden" id="unidade" name="unidade" value="${unidade}">
              <div class="form-grid form-grid--2col">
                <div class="form-field">
                  <label for="sku" class="form-label">SKU</label>
                  <input id="sku" name="sku" class="form-input" required placeholder="Ex: 123456" inputmode="numeric">
                </div>

                <div class="form-field">
                  <label for="nome" class="form-label">Nome / Descricao</label>
                  <input id="nome" name="nome" class="form-input" required placeholder="Ex: Batom Vermelho">
                </div>

                <div class="form-field form-field--full">
                  <label for="validade" class="form-label">Validade</label>
                  <input id="validade" name="validade" class="form-input" type="date" required>
                </div>

                <div class="form-field form-field--full">
                  <div class="form-actions">
                    <button type="button" class="btn btn--secondary" id="resetBtn">Limpar</button>
                    <button type="submit" class="btn btn--primary" id="submitBtn">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                        <polyline points="17 21 17 13 7 13 7 21"></polyline>
                        <polyline points="7 3 7 8 15 8"></polyline>
                      </svg>
                      Salvar
                    </button>
                  </div>
                </div>
              </div>

              <div id="resp" role="status" aria-live="polite"></div>
            </form>
          </div>
        </div>
      </div>

      <!-- Painel: Importar Planilha -->
      <div id="pane-planilha" class="tab-pane">
        <div class="card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <span class="card-header-title">Importar Planilha</span>
            <a href="/items?unidade=${unidade}" class="header-link text-small" style="text-transform:none;letter-spacing:0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
              Ver itens cadastrados
            </a>
          </div>
          <div class="card-body">
            <p class="text-muted text-small mb-4">
              Envie uma planilha <strong>.xlsx</strong> com as colunas <strong>SKU</strong> e <strong>Validade</strong>.
              Datas no formato <strong>DD-MM-AAAA</strong>. SKUs encontrados no catálogo terão o nome preenchido automaticamente.
            </p>

            <div class="upload-area" id="uploadArea">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-tertiary);margin-bottom:8px">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <p class="text-muted text-small" style="margin:0 0 12px">Arraste o arquivo aqui ou</p>
              <label for="planilhaInput" class="btn btn--secondary" style="cursor:pointer;margin:0">
                Selecionar arquivo
              </label>
              <input type="file" id="planilhaInput" accept=".xlsx,.xls" style="display:none">
              <p id="uploadFileName" class="text-small text-muted mt-2" style="display:none"></p>
            </div>

            <div id="planilhaLoading" style="display:none;text-align:center;padding:24px 0">
              <span class="btn-spinner" style="display:inline-block;margin-right:8px"></span>
              <span class="text-muted">Lendo planilha...</span>
            </div>

            <div id="planilhaError" class="message message--error mt-4" style="display:none"></div>

            <!-- Preview dos itens -->
            <div id="planilhaPreview" style="display:none">
              <div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 12px">
                <p class="text-small text-muted" id="previewCount"></p>
                <button class="btn btn--secondary btn--sm" id="planilhaClearBtn">Limpar</button>
              </div>
              <div class="table-container" style="border-radius:var(--radius-md);margin-bottom:16px">
                <table class="table" id="previewTable">
                  <thead>
                    <tr>
                      <th style="width:90px">SKU</th>
                      <th>Nome / Descrição</th>
                      <th style="width:120px">Validade</th>
                      <th style="width:80px">Status</th>
                    </tr>
                  </thead>
                  <tbody id="previewTableBody"></tbody>
                </table>
              </div>
              <div class="form-actions" style="justify-content:flex-end">
                <button class="btn btn--primary" id="planilhaSaveBtn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                    <polyline points="7 3 7 8 15 8"></polyline>
                  </svg>
                  Cadastrar Todos
                </button>
              </div>
              <div id="loteResp" role="status" aria-live="polite" class="mt-4"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="toast" class="toast"></div>
    <script>
      function switchTab(tab) {
        ['individual','planilha'].forEach(t => {
          document.getElementById('pane-' + t).classList.toggle('tab-pane--active', t === tab);
          document.getElementById('tab-btn-' + t).classList.toggle('tab-btn--active', t === tab);
        });
      }
    </script>
    <script src="/public/app.js" defer></script>
    ${getServiceWorkerScript()}
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

  // Sempre usa a unidade do cookie, ignorando query params
  const selectedUnidade = unidadeFromCookie;

  let products;
  if (selectedUnidade) {
    products = await listProductsByUnit(selectedUnidade);
  } else {
    products = await listProducts();
  }

  const selectedUnit = selectedUnidade ? getUnitById(selectedUnidade) : null;

  const rows = products.length > 0 ? products.map(p => {
    const unit = getUnitById(p.UNIDADE);
    return `
    <tr data-sku="${p.SKU}">
      <td>${p.SKU}</td>
      <td>${p.NOME}</td>
      <td>${p.VALIDADE}</td>
      <td>${unit ? unit.name : p.UNIDADE || '-'}</td>
      <td>
        <button class="btn btn--danger btn--sm" onclick="deleteProduct('${p.SKU}', this)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Excluir
        </button>
      </td>
    </tr>
  `;
  }).join('') : '';

  const html = `
  <!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta name="theme-color" content="#006837">
      <title>Itens Cadastrados${selectedUnit ? ` — ${selectedUnit.name}` : ''}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="/public/style.css">
      ${getPWAMetaTags()}
    </head>
    <body>
      <nav class="nav-bar">
        <a href="/cadastro" class="nav-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Voltar ao cadastro
        </a>
      </nav>

      <div class="container container--wide">
        <div class="header">
          <div class="header-content">
            <h1 class="header-title">Itens Cadastrados</h1>
            <p class="header-subtitle">${products.length} ${products.length === 1 ? 'item' : 'itens'}${selectedUnit ? ` em ${selectedUnit.name}` : ''}</p>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-header-title">Lista de Demonstradores</span>
          </div>
          <div class="table-container" style="border:0;border-radius:0">
            <table class="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Nome</th>
                  <th>Validade</th>
                  <th>Unidade</th>
                  <th style="width:120px">Acoes</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="5" class="table-empty">Nenhum item cadastrado</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="toast" class="toast"></div>

      <script>
        function showToast(msg) {
          const toast = document.getElementById('toast');
          toast.textContent = msg;
          toast.classList.add('show');
          setTimeout(() => toast.classList.remove('show'), 3000);
        }

        async function deleteProduct(sku, btn) {
          if (!confirm('Tem certeza que deseja excluir este item?')) return;

          btn.disabled = true;
          btn.innerHTML = '<span class="btn-spinner"></span> Excluindo...';

          try {
            const res = await fetch('/api/products/' + encodeURIComponent(sku), { method: 'DELETE' });
            const data = await res.json();

            if (data.ok) {
              const row = btn.closest('tr');
              row.style.transition = 'opacity 0.3s, transform 0.3s';
              row.style.opacity = '0';
              row.style.transform = 'translateX(10px)';
              setTimeout(() => row.remove(), 300);
              showToast('Item excluido com sucesso!');
            } else {
              showToast('Erro: ' + data.message);
              btn.disabled = false;
              btn.innerHTML = 'Excluir';
            }
          } catch (err) {
            showToast('Erro ao excluir item');
            btn.disabled = false;
            btn.innerHTML = 'Excluir';
          }
        }
      </script>
      ${getServiceWorkerScript()}
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

// ==================== API DE PRODUTOS ====================

// Deletar produto (demonstrador)
router.delete('/api/products/:sku', async (req, res) => {
  const { sku } = req.params;

  try {
    await deleteProduct(sku);
    res.json({ ok: true, message: 'Produto excluído com sucesso!' });
  } catch (err) {
    console.error('Erro ao excluir produto:', err);
    res.status(500).json({ ok: false, message: 'Erro ao excluir produto.' });
  }
});

// ==================== ÁREA ADMINISTRATIVA ====================

// Tela de login do admin
router.get('/admin-login', (req, res) => {
  const { error } = req.query;

  const html = `
  <!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta name="theme-color" content="#006837">
      <title>Login — Painel Administrativo</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="/public/style.css">
      ${getPWAMetaTags()}
    </head>
    <body class="login-container">
      <div class="login-box">
        <div class="card">
          <div class="card-body">
            <div class="login-header">
              <div class="logo">
                <img src="/public/logo.png" alt="Logo" class="logo-img">
              </div>
              <h1 class="login-title">Painel Administrativo</h1>
              <p class="login-subtitle">Digite a senha para acessar</p>
            </div>

            ${error ? '<div class="message message--error mb-4">Senha incorreta. Tente novamente.</div>' : ''}

            <form method="POST" action="/admin-login">
              <div class="form-field mb-4">
                <label for="senha" class="form-label">Senha</label>
                <input type="password" id="senha" name="senha" class="form-input" placeholder="Digite sua senha" required autofocus>
              </div>
              <button type="submit" class="btn btn--primary" style="width:100%">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                Entrar
              </button>
            </form>

            <p class="text-center text-muted text-small mt-4">
              <a href="/" class="header-link">Voltar ao inicio</a>
            </p>
          </div>
        </div>
      </div>
      ${getServiceWorkerScript()}
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

  const productRows = products.length > 0 ? products.map(p => {
    const unit = getUnitById(p.UNIDADE);
    return `
    <tr>
      <td>${p.SKU}</td>
      <td>${p.NOME}</td>
      <td>${p.VALIDADE}</td>
      <td>${unit ? unit.name : p.UNIDADE || '-'}</td>
    </tr>
  `;
  }).join('') : '';

  const exchangeRows = exchanges.length > 0 ? exchanges.map(e => {
    const unit = getUnitById(e.unidade);
    return `
    <tr>
      <td>${e.sku}</td>
      <td>${e.produtoNome || '-'}</td>
      <td>${unit ? unit.name : e.unidade}</td>
      <td>${e.userName}</td>
      <td>${e.clickedAt || '-'}</td>
    </tr>
  `;
  }).join('') : '';

  const unitOptions = getAllUnits().map(u => `<option value="${u.id}">${u.name}</option>`).join('');

  const html = `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <meta name="theme-color" content="#006837">
        <title>Painel Administrativo</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="/public/style.css">
        ${getPWAMetaTags()}
      </head>
      <body>
        <nav class="nav-bar">
          <a href="/" class="nav-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Voltar ao site
          </a>
          <a href="/admin-logout" class="btn btn--danger btn--sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Sair
          </a>
        </nav>

        <div class="container container--wide">
          <div class="header">
            <div class="logo">
              <img src="/public/logo.png" alt="Logo" class="logo-img">
            </div>
            <div class="header-content">
              <h1 class="header-title">Painel Administrativo</h1>
              <p class="header-subtitle">Gerencie produtos e notificacoes</p>
            </div>
          </div>

          <!-- Produtos -->
          <div class="card mb-4">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
              <span class="card-header-title">Produtos Cadastrados (${products.length})</span>
              <button id="trigger" class="btn btn--primary btn--sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 2L11 13"></path>
                  <path d="M22 2l-7 20-4-9-9-4 20-7z"></path>
                </svg>
                Disparar notificacoes
              </button>
            </div>
            <div class="table-container" style="border:0;border-radius:0">
              <table class="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Nome</th>
                    <th>Validade</th>
                    <th>Unidade</th>
                  </tr>
                </thead>
                <tbody>
                  ${productRows || '<tr><td colspan="4" class="table-empty">Nenhum produto cadastrado</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Teste Avançado -->
          <div class="card mb-4">
            <div class="card-header">
              <span class="card-header-title">Enviar Mensagem de Teste</span>
            </div>
            <div class="card-body">
              <div class="form-grid" style="gap:16px">
                <!-- Linha 1: Produto -->
                <div class="form-field form-field--full">
                  <label class="form-label">Produto de Teste</label>
                  <div style="display:flex;gap:12px;flex-wrap:wrap">
                    <input id="testSku" class="form-input" placeholder="SKU (ex: 12345)" style="flex:1;min-width:120px">
                    <input id="testNome" class="form-input" placeholder="Nome do produto" style="flex:2;min-width:200px">
                    <input id="testValidade" type="date" class="form-input" style="flex:1;min-width:140px">
                  </div>
                  <span class="form-hint">Deixe em branco para usar produto exemplo automatico</span>
                </div>

                <!-- Linha 2: Unidade -->
                <div class="form-field">
                  <label for="testUnidade" class="form-label">Unidade</label>
                  <select id="testUnidade" class="form-input">
                    ${unitOptions}
                  </select>
                </div>

                <!-- Linha 3: Modo de envio -->
                <div class="form-field form-field--full">
                  <label class="form-label">Destinatarios</label>
                  <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                      <input type="radio" name="testMode" value="single" checked> Enviar para um Slack ID
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                      <input type="radio" name="testMode" value="multiple"> Enviar para multiplos IDs
                    </label>
                  </div>
                  <div id="singleUserBox">
                    <input id="testUser" class="form-input" placeholder="Slack ID (ex: U0895CZ8HU7)" value="U0895CZ8HU7">
                  </div>
                  <div id="multiUserBox" style="display:none">
                    <textarea id="testUsers" class="form-input" rows="3" placeholder="Cole os Slack IDs separados por virgula ou linha:&#10;U0895CZ8HU7&#10;U07L4D3EWJW&#10;U08F8T8SMNE"></textarea>
                    <span class="form-hint">Separe os IDs por virgula, espaco ou quebra de linha</span>
                  </div>
                </div>

                <!-- Botao -->
                <div class="form-field form-field--full">
                  <button id="testBtn" class="btn btn--primary" style="width:100%">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="22" y1="2" x2="11" y2="13"></line>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                    Enviar Teste
                  </button>
                </div>
              </div>

              <div id="resp" class="message mt-4" style="display:none"></div>
            </div>
          </div>

          <!-- Trocas -->
          <div class="card">
            <div class="card-header">
              <span class="card-header-title">Trocas Registradas (${exchanges.length})</span>
            </div>
            <div class="table-container" style="border:0;border-radius:0">
              <table class="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Produto</th>
                    <th>Unidade</th>
                    <th>Trocado por</th>
                    <th>Data/Hora</th>
                  </tr>
                </thead>
                <tbody>
                  ${exchangeRows || '<tr><td colspan="5" class="table-empty">Nenhuma troca registrada</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div id="toast" class="toast"></div>

        <script>
          const respEl = document.getElementById('resp');
          function showResp(msg, isError) {
            respEl.textContent = msg;
            respEl.style.display = 'block';
            respEl.className = 'message mt-4 ' + (isError ? 'message--error' : 'message--success');
          }

          document.getElementById('trigger').addEventListener('click', async () => {
            showResp('Executando...', false);
            try {
              const r = await fetch('/admin/notify', { method: 'POST' });
              const j = await r.json();
              showResp(j.message || JSON.stringify(j), !j.ok);
            } catch (err) {
              showResp('Erro: ' + err.message, true);
            }
          });

          // Toggle entre modo single e multiple
          document.querySelectorAll('input[name="testMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
              document.getElementById('singleUserBox').style.display = e.target.value === 'single' ? 'block' : 'none';
              document.getElementById('multiUserBox').style.display = e.target.value === 'multiple' ? 'block' : 'none';
            });
          });

          document.getElementById('testBtn').addEventListener('click', async () => {
            const mode = document.querySelector('input[name="testMode"]:checked').value;
            const unidade = document.getElementById('testUnidade').value;
            const sku = document.getElementById('testSku').value.trim();
            const nome = document.getElementById('testNome').value.trim();
            const validade = document.getElementById('testValidade').value;

            let users = [];
            if (mode === 'single') {
              const user = document.getElementById('testUser').value.trim();
              if (user) users.push(user);
            } else {
              const text = document.getElementById('testUsers').value;
              users = text.split(/[,\\s]+/).map(s => s.trim()).filter(s => s.startsWith('U'));
            }

            if (users.length === 0) {
              showResp('Informe pelo menos um Slack ID', true);
              return;
            }

            showResp('Enviando teste para ' + users.length + ' destinatario(s)...', false);
            try {
              const r = await fetch('/admin/test', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ users, unidade, sku, nome, validade })
              });
              const j = await r.json();
              showResp(j.message || JSON.stringify(j), !j.ok);
            } catch (err) {
              showResp('Erro: ' + err.message, true);
            }
          });
        </script>
        ${getServiceWorkerScript()}
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

  if (!app) return res.status(400).json({ ok: false, message: 'Slack App não configurado.' });

  // Suporte a array de usuarios ou usuario unico (retrocompatibilidade)
  let users = req.body.users || [];
  if (req.body.user && users.length === 0) {
    users = [req.body.user];
  }
  if (users.length === 0) {
    users = ['U0895CZ8HU7'];
  }

  const unidade = req.body.unidade || 'vd-palmeira';
  const customSku = req.body.sku || '';
  const customNome = req.body.nome || '';
  const customValidade = req.body.validade || '';

  try {
    let items = [];

    // Se usuario definiu produto customizado
    if (customSku || customNome) {
      const validade = customValidade || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0,10);
      items = [{
        SKU: customSku || '0000',
        NOME: customNome || 'Produto Teste',
        VALIDADE: validade,
        UNIDADE: unidade
      }];
    } else {
      // Busca produtos reais da unidade que vencem em 7 dias
      const products = await listProductsByUnit(unidade);
      items = products.filter(p => {
        const expiryDate = parseDate(p.VALIDADE);
        return daysUntil(expiryDate) === 7;
      });

      // Se nao houver, usa exemplo
      if (items.length === 0) {
        items = [{
          SKU: '0000',
          NOME: 'Exemplo Produto',
          VALIDADE: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0,10),
          UNIDADE: unidade
        }];
      }
    }

    // Envia para todos os usuarios em paralelo
    const results = await Promise.allSettled(
      users.map(user => sendAlertsToMember(app, user, items, unidade))
    );

    const success = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    if (failed > 0) {
      const errors = results
        .filter(r => r.status === 'rejected')
        .map(r => r.reason?.data?.error || r.reason?.message || 'Erro desconhecido');
      console.error('Erros ao enviar testes:', errors);
    }

    const itemInfo = customSku || customNome
      ? `produto "${items[0].NOME}" (SKU: ${items[0].SKU}, Validade: ${items[0].VALIDADE})`
      : `${items.length} item(ns)`;

    if (failed === 0) {
      return res.json({ ok: true, message: `Teste enviado para ${success} destinatario(s) com ${itemInfo}.` });
    } else {
      return res.json({ ok: true, message: `Enviado para ${success} de ${users.length} destinatarios. ${failed} falha(s).` });
    }
  } catch (err) {
    console.error('Erro ao enviar teste:', err?.data?.error || err.message || err);
    return res.status(500).json({ ok: false, message: 'Falha ao enviar mensagem de teste.' });
  }
});

// ==================== IMPORTAÇÃO POR PLANILHA ====================

// POST /upload-planilha — lê o xlsx e retorna preview (não salva nada)
router.post('/upload-planilha', upload.single('planilha'), (req, res) => {
  const cookies = parseCookies(req);
  const unidade = cookies.unidade;
  if (!unidade || !getUnitById(unidade)) {
    return res.status(401).json({ ok: false, message: 'Não autenticado.' });
  }

  if (!req.file) {
    return res.status(400).json({ ok: false, message: 'Nenhum arquivo enviado.' });
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) {
      return res.status(400).json({ ok: false, message: 'A planilha está vazia.' });
    }

    // Encontra as colunas SKU e Validade (insensível a maiúsculas)
    const sampleKeys = Object.keys(rows[0]);
    const skuKey = sampleKeys.find(k => k.toLowerCase().replace(/\s/g, '') === 'sku');
    const validadeKey = sampleKeys.find(k =>
      k.toLowerCase().includes('validade') || k.toLowerCase().includes('vencimento')
    );

    if (!skuKey || !validadeKey) {
      return res.status(400).json({
        ok: false,
        message: `Colunas não encontradas. A planilha precisa ter colunas "SKU" e "Validade". Colunas encontradas: ${sampleKeys.join(', ')}`
      });
    }

    const items = [];
    for (const row of rows) {
      const rawSku = String(row[skuKey] ?? '').trim().replace(/\.0$/, '');
      const rawValidade = row[validadeKey];

      if (!rawSku || rawSku === '' || rawSku === '0') continue;

      // Parse da data: aceita DD-MM-YYYY (texto), YYYY-MM-DD, ou Date (xlsx com cellDates:true)
      let validade = null;
      if (rawValidade instanceof Date) {
        const d = rawValidade;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        validade = `${y}-${m}-${day}`;
      } else {
        const s = String(rawValidade).trim();
        const ddmmyyyy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        const yyyymmdd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (ddmmyyyy) {
          validade = `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
        } else if (yyyymmdd) {
          validade = s;
        }
      }

      if (!validade || !isValidDateString(validade)) continue;

      const catalog = getProductFromCatalog(rawSku);
      items.push({
        sku: rawSku,
        nome: catalog ? catalog.nome : null,
        inCatalog: !!catalog,
        validade
      });
    }

    if (!items.length) {
      return res.status(400).json({ ok: false, message: 'Nenhum item válido encontrado na planilha. Verifique se as colunas são "SKU" e "Validade" e se as datas estão no formato DD-MM-AAAA.' });
    }

    res.json({ ok: true, items });
  } catch (err) {
    console.error('Erro ao processar planilha:', err);
    res.status(400).json({ ok: false, message: 'Erro ao ler planilha. Verifique se o arquivo é .xlsx ou .xls.' });
  }
});

// POST /add-lote — cadastra vários itens de uma vez
router.post('/add-lote', express.json(), async (req, res) => {
  const cookies = parseCookies(req);
  const unidade = cookies.unidade;
  if (!unidade || !getUnitById(unidade)) {
    return res.status(401).json({ ok: false, message: 'Não autenticado.' });
  }

  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: 'Nenhum item recebido.' });
  }

  let success = 0;
  const errors = [];

  for (const item of items) {
    const { sku, nome, validade } = item;
    if (!sku || !nome || !nome.trim() || !validade) {
      errors.push(`SKU ${sku}: dados incompletos.`);
      continue;
    }
    if (!isValidDateString(validade)) {
      errors.push(`SKU ${sku}: data inválida.`);
      continue;
    }
    try {
      await addProduct({ sku, nome: nome.trim(), validade, unidade });
      const existsInCatalog = getProductFromCatalog(sku);
      if (!existsInCatalog) {
        addProductToCatalog({ sku, nome: nome.trim() });
      }
      success++;
    } catch (err) {
      console.error(`Erro ao salvar SKU ${sku}:`, err);
      errors.push(`SKU ${sku}: erro ao salvar.`);
    }
  }

  res.json({ ok: true, success, errors });
});

module.exports = router;
