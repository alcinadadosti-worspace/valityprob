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
    <link rel="stylesheet" href="/public/style.css">
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

    <script src="/public/app.js" defer></script>
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