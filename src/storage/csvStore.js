const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const DATA_DIR = path.join(__dirname, '../../data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.csv');
const EXCHANGES_FILE = path.join(DATA_DIR, 'exchanges.csv');
const CATALOG_FILE = path.join(DATA_DIR, 'estoque.csv');

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
    const columns = ['SKU', 'PRODUTO_NOME', 'USER_ID', 'USER_NAME', 'UNIDADE', 'CLICKED_AT'];
    fs.writeFileSync(EXCHANGES_FILE, columns.join(',') + '\n');
  }
};

const ensureCatalogFile = () => {
  ensureDir();
  if (!fs.existsSync(CATALOG_FILE)) {
    fs.writeFileSync(CATALOG_FILE, 'Produto;Descrição\n');
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

  // Remove produto existente com mesmo SKU (upsert)
  products = products.filter(p => p.SKU !== sku);

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

const deleteProduct = (sku) => {
  ensureProductsFile();
  let products = listProducts();
  products = products.filter(p => p.SKU !== sku);

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
    clickedAt: e.CLICKED_AT
  }));
};

const listExchangesByUnit = (unidade) => {
  const exchanges = listExchanges();
  return exchanges.filter(e => e.unidade === unidade);
};

const addExchange = ({ sku, produtoNome, userId, userName, unidade }) => {
  ensureExchangesFile();
  let exchanges = readCsv(EXCHANGES_FILE);

  // Remove exchange existente com mesmo SKU e unidade (upsert)
  exchanges = exchanges.filter(e => !(e.SKU === sku && e.UNIDADE === unidade));

  // Adiciona novo exchange
  exchanges.push({
    SKU: sku,
    PRODUTO_NOME: produtoNome,
    USER_ID: userId,
    USER_NAME: userName,
    UNIDADE: unidade,
    CLICKED_AT: new Date().toISOString()
  });

  const output = stringify(exchanges, {
    header: true,
    columns: ['SKU', 'PRODUTO_NOME', 'USER_ID', 'USER_NAME', 'UNIDADE', 'CLICKED_AT']
  });

  fs.writeFileSync(EXCHANGES_FILE, output);
  return true;
};

const hasExchange = (sku, unidade) => {
  const exchanges = listExchanges();
  return exchanges.some(e => e.sku === sku && e.unidade === unidade);
};

const getExchange = (sku, unidade) => {
  const exchanges = listExchanges();
  return exchanges.find(e => e.sku === sku && e.unidade === unidade) || null;
};

const deleteExchange = (sku, unidade) => {
  ensureExchangesFile();
  let exchanges = readCsv(EXCHANGES_FILE);
  exchanges = exchanges.filter(e => !(e.SKU === sku && e.UNIDADE === unidade));

  const output = stringify(exchanges, {
    header: true,
    columns: ['SKU', 'USER_ID', 'USER_NAME', 'UNIDADE', 'CLICKED_AT']
  });

  fs.writeFileSync(EXCHANGES_FILE, output);
  return true;
};

// ==================== CATALOG (estoque.csv) ====================
// Colunas: Produto (SKU), Descrição (nome do item)
// Usa ponto-e-vírgula como separador
// CACHE em memória para busca rápida (arquivo tem 180k+ linhas)

let catalogCache = null;
let catalogDescKey = null;

const loadCatalogCache = () => {
  if (catalogCache) return;

  ensureCatalogFile();
  const products = readCsv(CATALOG_FILE, ';');

  // Cria um Map indexado por SKU para busca O(1)
  catalogCache = new Map();

  if (products.length > 0) {
    catalogDescKey = Object.keys(products[0]).find(k => k.includes('Descri')) || 'Descrição';

    for (const p of products) {
      // Só guarda o primeiro (evita duplicados)
      if (!catalogCache.has(p.Produto)) {
        catalogCache.set(p.Produto, p[catalogDescKey] || '');
      }
    }
  }

  console.log(`📦 Catálogo carregado: ${catalogCache.size} produtos únicos`);
};

const getProductFromCatalog = (sku) => {
  loadCatalogCache();

  if (catalogCache.has(sku)) {
    return { sku, nome: catalogCache.get(sku) };
  }
  return null;
};

const addProductToCatalog = ({ sku, nome }) => {
  loadCatalogCache();

  // Adiciona ao cache
  catalogCache.set(sku, nome);

  // Também salva no arquivo
  ensureCatalogFile();
  let products = readCsv(CATALOG_FILE, ';');
  products = products.filter(p => p.Produto !== sku);

  const descKey = catalogDescKey || 'Descrição';
  const newProduct = { Produto: sku };
  newProduct[descKey] = nome;
  products.push(newProduct);

  const columns = ['Produto', descKey];
  const output = stringify(products, {
    header: true,
    columns: columns,
    delimiter: ';'
  });

  fs.writeFileSync(CATALOG_FILE, output);
  return true;
};

const listCatalog = () => {
  loadCatalogCache();

  const result = [];
  for (const [sku, nome] of catalogCache) {
    result.push({ sku, nome });
  }
  return result;
};

module.exports = {
  listProducts,
  listProductsByUnit,
  addProduct,
  deleteProduct,
  addExchange,
  hasExchange,
  getExchange,
  listExchanges,
  listExchangesByUnit,
  deleteExchange,
  getProductFromCatalog,
  addProductToCatalog,
  listCatalog
};
