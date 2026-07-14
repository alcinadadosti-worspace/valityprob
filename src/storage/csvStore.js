const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const catalog = require('./catalogStore');

const DATA_DIR = path.join(__dirname, '../../data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.csv');
const EXCHANGES_FILE = path.join(DATA_DIR, 'exchanges.csv');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.csv');

// ==================== FILE HELPERS ====================

const ensureDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const ensureProductsFile = () => {
  ensureDir();
  if (!fs.existsSync(PRODUCTS_FILE)) {
    const columns = ['SKU', 'NOME', 'VALIDADE', 'UNIDADE'];
    fs.writeFileSync(PRODUCTS_FILE, columns.join(',') + '\n');
  }
};

const ensureExchangesFile = () => {
  ensureDir();
  if (!fs.existsSync(EXCHANGES_FILE)) {
    const columns = ['SKU', 'PRODUTO_NOME', 'USER_ID', 'USER_NAME', 'UNIDADE', 'VALIDADE', 'CLICKED_AT'];
    fs.writeFileSync(EXCHANGES_FILE, columns.join(',') + '\n');
  }
};

const ensureNotificationsFile = () => {
  ensureDir();
  if (!fs.existsSync(NOTIFICATIONS_FILE)) {
    fs.writeFileSync(NOTIFICATIONS_FILE, ['SKU', 'UNIDADE', 'VALIDADE', 'NOTIFIED_AT'].join(',') + '\n');
  }
};

const readCsv = (filePath, delimiter = ',') => {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: delimiter
  });
};

// ==================== PRODUCTS ====================

const listProducts = () => {
  ensureProductsFile();
  return readCsv(PRODUCTS_FILE);
};

const listProductsByUnit = (unidade) => {
  const products = listProducts();
  return products.filter(p => p.UNIDADE === unidade);
};

const addProduct = ({ sku, nome, validade, unidade }) => {
  ensureProductsFile();
  let products = listProducts();

  // Remove produto existente com mesmo SKU na MESMA unidade (upsert).
  // O mesmo SKU em outra loja é um item diferente e precisa ser preservado.
  products = products.filter(p => !(p.SKU === sku && p.UNIDADE === unidade));

  // Adiciona novo produto
  products.push({
    SKU: sku,
    NOME: nome,
    VALIDADE: validade,
    UNIDADE: unidade
  });

  const output = stringify(products, {
    header: true,
    columns: ['SKU', 'NOME', 'VALIDADE', 'UNIDADE']
  });

  fs.writeFileSync(PRODUCTS_FILE, output);
  return true;
};

const deleteProduct = (sku, unidade) => {
  ensureProductsFile();
  const products = listProducts();
  const remaining = products.filter(p => !(p.SKU === sku && p.UNIDADE === unidade));
  if (remaining.length === products.length) return false;

  const output = stringify(remaining, {
    header: true,
    columns: ['SKU', 'NOME', 'VALIDADE', 'UNIDADE']
  });

  fs.writeFileSync(PRODUCTS_FILE, output);
  return true;
};

const updateProduct = ({ sku, unidade, nome, validade }) => {
  ensureProductsFile();
  const products = listProducts();
  const idx = products.findIndex(p => p.SKU === sku && p.UNIDADE === unidade);
  if (idx === -1) return false;

  if (nome !== undefined) products[idx].NOME = nome;
  if (validade !== undefined) products[idx].VALIDADE = validade;

  const output = stringify(products, {
    header: true,
    columns: ['SKU', 'NOME', 'VALIDADE', 'UNIDADE']
  });

  fs.writeFileSync(PRODUCTS_FILE, output);
  return true;
};

// ==================== EXCHANGES ====================

const listExchanges = () => {
  ensureExchangesFile();
  return readCsv(EXCHANGES_FILE).map(e => ({
    sku: e.SKU,
    produtoNome: e.PRODUTO_NOME,
    userId: e.USER_ID,
    userName: e.USER_NAME,
    unidade: e.UNIDADE,
    validade: e.VALIDADE || '',
    clickedAt: e.CLICKED_AT
  }));
};

const listExchangesByUnit = (unidade) => {
  const exchanges = listExchanges();
  return exchanges.filter(e => e.unidade === unidade);
};

const addExchange = ({ sku, produtoNome, userId, userName, unidade, validade }) => {
  ensureExchangesFile();
  let exchanges = readCsv(EXCHANGES_FILE);

  // Remove exchange existente com mesmo SKU, unidade E validade (upsert)
  exchanges = exchanges.filter(e => !(e.SKU === sku && e.UNIDADE === unidade && e.VALIDADE === validade));

  // Adiciona novo exchange
  exchanges.push({
    SKU: sku,
    PRODUTO_NOME: produtoNome,
    USER_ID: userId,
    USER_NAME: userName,
    UNIDADE: unidade,
    VALIDADE: validade || '',
    CLICKED_AT: new Date().toISOString()
  });

  const output = stringify(exchanges, {
    header: true,
    columns: ['SKU', 'PRODUTO_NOME', 'USER_ID', 'USER_NAME', 'UNIDADE', 'VALIDADE', 'CLICKED_AT']
  });

  fs.writeFileSync(EXCHANGES_FILE, output);
  return true;
};

const hasExchange = (sku, unidade, validade) => {
  const exchanges = listExchanges();
  return exchanges.some(e => e.sku === sku && e.unidade === unidade && e.validade === validade);
};

const getExchange = (sku, unidade, validade) => {
  const exchanges = listExchanges();
  return exchanges.find(e => e.sku === sku && e.unidade === unidade && e.validade === validade) || null;
};

const deleteExchange = (sku, unidade, validade) => {
  ensureExchangesFile();
  let exchanges = readCsv(EXCHANGES_FILE);
  exchanges = exchanges.filter(e => !(e.SKU === sku && e.UNIDADE === unidade && e.VALIDADE === validade));

  const output = stringify(exchanges, {
    header: true,
    columns: ['SKU', 'PRODUTO_NOME', 'USER_ID', 'USER_NAME', 'UNIDADE', 'VALIDADE', 'CLICKED_AT']
  });

  fs.writeFileSync(EXCHANGES_FILE, output);
  return true;
};

// ==================== NOTIFICATIONS (ledger de alertas enviados) ====================
// Marca que já enviamos o alerta de "faltam N dias" para um (sku, unidade, validade),
// para não reenviar todo ciclo do cron. Mudar a validade cria uma chave nova (novo ciclo).

const hasNotified = (sku, unidade, validade) => {
  ensureNotificationsFile();
  const rows = readCsv(NOTIFICATIONS_FILE);
  return rows.some(n => n.SKU === sku && n.UNIDADE === unidade && n.VALIDADE === (validade || ''));
};

const addNotified = ({ sku, unidade, validade }) => {
  ensureNotificationsFile();
  const rows = readCsv(NOTIFICATIONS_FILE);
  const v = validade || '';
  if (rows.some(n => n.SKU === sku && n.UNIDADE === unidade && n.VALIDADE === v)) return true;

  rows.push({ SKU: sku, UNIDADE: unidade, VALIDADE: v, NOTIFIED_AT: new Date().toISOString() });
  fs.writeFileSync(NOTIFICATIONS_FILE, stringify(rows, {
    header: true, columns: ['SKU', 'UNIDADE', 'VALIDADE', 'NOTIFIED_AT']
  }));
  return true;
};

// ==================== CATALOG ====================
// Implementação compartilhada com o postgresStore (o catálogo é sempre CSV).

module.exports = {
  listProducts,
  listProductsByUnit,
  addProduct,
  updateProduct,
  deleteProduct,
  addExchange,
  hasExchange,
  getExchange,
  listExchanges,
  listExchangesByUnit,
  deleteExchange,
  hasNotified,
  addNotified,
  ...catalog
};
