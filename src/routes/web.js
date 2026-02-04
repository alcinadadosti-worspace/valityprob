const express = require('express');
const router = express.Router();
const { addProduct } = require('../storage/csvStore');
const { isValidDateString } = require('../utils/dates');

router.use(express.urlencoded({ extended: true }));

// Página com Formulário
router.get('/', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Cadastro de Demonstrador</title>
    <meta charset="utf-8">
    <style>
      body { font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; }
      label { display: block; margin-top: 10px; }
      input { width: 100%; padding: 8px; margin-top: 5px; }
      button { margin-top: 20px; padding: 10px 20px; background: #007a5a; color: white; border: none; cursor: pointer; }
      .success { color: green; }
      .error { color: red; }
    </style>
  </head>
  <body>
    <h1>Cadastro de Produto (Demonstrador)</h1>
    <form action="/add" method="POST">
      <label>SKU:</label>
      <input type="text" name="sku" required placeholder="Ex: 123456">
      
      <label>Nome/Descrição:</label>
      <input type="text" name="nome" required placeholder="Ex: Batom Vermelho">
      
      <label>Validade (YYYY-MM-DD):</label>
      <input type="date" name="validade" required>
      
      <label>Slack Member ID do Gerente:</label>
      <input type="text" name="managerId" required placeholder="U0123ABC (Necessário para receber DMs)">
      
      <button type="submit">Salvar</button>
    </form>
  </body>
  </html>
  `;
  res.send(html);
});

// Processar POST
router.post('/add', (req, res) => {
  const { sku, nome, validade, managerId } = req.body;

  if (!sku || !nome || !validade || !managerId) {
    return res.status(400).send('<h3 class="error">Preencha todos os campos. <a href="/">Voltar</a></h3>');
  }

  if (!isValidDateString(validade)) {
    return res.status(400).send('<h3 class="error">Data inválida. <a href="/">Voltar</a></h3>');
  }

  try {
    addProduct({ sku, nome, validade, managerId });
    res.send('<h3 class="success">Produto cadastrado com sucesso! <a href="/">Cadastrar outro</a></h3>');
  } catch (err) {
    console.error(err);
    res.status(500).send('<h3 class="error">Erro interno ao salvar.</h3>');
  }
});

module.exports = router;