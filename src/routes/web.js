const express = require('express');
const router = express.Router();
const { addProduct } = require('../storage/csvStore');
const { isValidDateString } = require('../utils/dates');

router.use(express.urlencoded({ extended: true }));

// Página com Formulário
router.get('/', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Cadastro de Demonstrador — O Boticário</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
      :root{--bg:#f6faf8;--card:#ffffff;--accent:#006837;--muted:#6b7280;--brand:#ffd24d}
      *{box-sizing:border-box}
      body{font-family:Inter,system-ui,Segoe UI,Roboto,"Helvetica Neue",Arial,sans-serif;background:linear-gradient(180deg,#f0f8f5 0%,var(--bg) 100%);margin:0;padding:32px;display:flex;align-items:center;justify-content:center;min-height:100vh}
      .container{width:100%;max-width:800px;padding:24px}
      .header{display:flex;align-items:center;gap:16px;margin-bottom:18px}
      .logo{width:56px;height:56px;border-radius:12px;display:flex;align-items:center;justify-content:center}
      h1{font-size:20px;margin:0}
      p.lead{margin:4px 0 0;color:var(--muted)}
      .card{background:var(--card);border-radius:12px;box-shadow:0 6px 20px rgba(15,23,42,0.06);padding:20px;margin-top:12px}
      form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .full{grid-column:1/-1}
      label{display:block;font-size:13px;color:#111827;margin-bottom:6px}
      input,select,button{font-size:15px}
      input,select{width:100%;padding:10px 12px;border:1px solid #e6eef0;border-radius:8px;background:transparent}
      input:focus{outline:none;box-shadow:0 0 0 4px rgba(0,102,68,0.06);border-color:var(--accent)}
      .actions{display:flex;gap:10px;justify-content:flex-end;align-items:center;margin-top:6px}
      button{background:var(--accent);color:#fff;padding:10px 16px;border-radius:8px;border:none;cursor:pointer}
      button.secondary{background:#eef2f1;color:#0f172a}
      .note{font-size:13px;color:var(--muted)}
      .message{padding:10px;border-radius:8px;margin-top:12px;font-weight:600}
      .success{background:#ecfdf5;color:#065f46}
      .error{background:#fff1f2;color:#7f1d1d}
      @media(max-width:640px){form{grid-template-columns:1fr} .header{gap:10px} .logo{width:48px;height:48px}}
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="logo" aria-hidden="true">
          <svg width="56" height="56" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="O Boticário">
            <defs>
              <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stop-color="#007442" />
                <stop offset="100%" stop-color="#005c2e" />
              </linearGradient>
            </defs>
            <rect rx="12" width="56" height="56" fill="url(#g)" />
            <text x="50%" y="55%" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="22" fill="#fff" text-anchor="middle" dominant-baseline="middle">OB</text>
          </svg>
        </div>
        <div>
          <h1>Cadastro de Demonstrador</h1>
          <p class="lead">Adicione produtos e informe o gerente para receber notificações no Slack.</p>
        </div>
      </div>

      <div class="card">
        <form id="productForm">
          <div>
            <label for="sku">SKU</label>
            <input id="sku" name="sku" required placeholder="Ex: 123456">
          </div>

          <div>
            <label for="nome">Nome / Descrição</label>
            <input id="nome" name="nome" required placeholder="Ex: Batom Vermelho">
          </div>

          <div>
            <label for="validade">Validade</label>
            <input id="validade" name="validade" type="date" required>
          </div>

          <div>
            <label for="managerId">Slack Member ID do Gerente</label>
            <input id="managerId" name="managerId" required placeholder="U0123ABC">
          </div>

          <div class="full">
            <p class="note">Dica: o Slack Member ID é necessário para que o gerente receba DMs com avisos de validade.</p>
          </div>

          <div class="full actions">
            <button type="button" class="secondary" id="resetBtn">Limpar</button>
            <button type="submit" id="submitBtn">Salvar</button>
          </div>

          <div id="resp" class="full" aria-live="polite"></div>
        </form>
      </div>
    </div>

    <script>
      const form = document.getElementById('productForm');
      const resp = document.getElementById('resp');
      const resetBtn = document.getElementById('resetBtn');

      resetBtn.addEventListener('click', () => { form.reset(); resp.innerHTML = ''; resp.className = ''; });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        resp.innerHTML = '';
        resp.className = '';

        const data = new FormData(form);
        try {
          const res = await fetch('/add', {
            method: 'POST',
            headers: { 'Accept': 'application/json' },
            body: data
          });
          const json = await res.json().catch(() => null);
          if (res.ok) {
            resp.textContent = (json && json.message) ? json.message : 'Produto cadastrado com sucesso!';
            resp.className = 'message success';
            form.reset();
          } else {
            const msg = (json && json.message) ? json.message : 'Erro ao cadastrar';
            resp.textContent = msg;
            resp.className = 'message error';
          }
        } catch (err) {
          resp.textContent = 'Falha de rede. Tente novamente.';
          resp.className = 'message error';
        }
      });
    </script>
  </body>
  </html>
  `;
  res.send(html);
});

// Processar POST
router.post('/add', (req, res) => {
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