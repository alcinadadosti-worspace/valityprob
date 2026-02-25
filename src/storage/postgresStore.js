const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const DATA_DIR = path.join(__dirname, '../../data');
const CATALOG_FILE = path.join(DATA_DIR, 'estoque.csv');

const getPool = () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  return new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
};

// ==================== PRODUCTS ====================

const listProducts = async () => {
  const pool = getPool();
  const res = await pool.query(
    `SELECT sku AS "SKU", nome AS "NOME", to_char(validade, 'YYYY-MM-DD') AS "VALIDADE", unidade AS "UNIDADE"
     FROM products ORDER BY validade`
  );
  await pool.end();
  return res.rows;
};

const listProductsByUnit = async (unidade) => {
  const pool = getPool();
  const res = await pool.query(
    `SELECT sku AS "SKU", nome AS "NOME", to_char(validade, 'YYYY-MM-DD') AS "VALIDADE", unidade AS "UNIDADE"
     FROM products WHERE unidade = $1 ORDER BY validade`,
    [unidade]
  );
  await pool.end();
  return res.rows;
};

const addProduct = async ({ sku, nome, validade, unidade }) => {
  const pool = getPool();
  await pool.query(
    `INSERT INTO products (sku, nome, validade, unidade) VALUES ($1, $2, $3, $4)
     ON CONFLICT (sku) DO UPDATE SET nome = EXCLUDED.nome, validade = EXCLUDED.validade, unidade = EXCLUDED.unidade`,
    [sku, nome, validade, unidade]
  );
  await pool.end();
  return true;
};

const deleteProduct = async (sku) => {
  const pool = getPool();
  await pool.query(`DELETE FROM products WHERE sku = $1`, [sku]);
  await pool.end();
  return true;
};

// ==================== EXCHANGES ====================

const addExchange = async ({ sku, produtoNome, userId, userName, unidade }) => {
  const pool = getPool();
  await pool.query(
    `INSERT INTO exchanges (sku, produto_nome, user_id, user_name, unidade) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (sku, unidade) DO UPDATE SET produto_nome = EXCLUDED.produto_nome, user_id = EXCLUDED.user_id, user_name = EXCLUDED.user_name, clicked_at = CURRENT_TIMESTAMP`,
    [sku, produtoNome, userId, userName, unidade]
  );
  await pool.end();
  return true;
};

const hasExchange = async (sku, unidade) => {
  const pool = getPool();
  const res = await pool.query(
    `SELECT 1 FROM exchanges WHERE sku = $1 AND unidade = $2 LIMIT 1`,
    [sku, unidade]
  );
  await pool.end();
  return res.rows.length > 0;
};

const getExchange = async (sku, unidade) => {
  const pool = getPool();
  const res = await pool.query(
    `SELECT sku, produto_nome AS "produtoNome", user_id AS "userId", user_name AS "userName", unidade, clicked_at AS "clickedAt"
     FROM exchanges WHERE sku = $1 AND unidade = $2`,
    [sku, unidade]
  );
  await pool.end();
  return res.rows[0] || null;
};

const listExchanges = async () => {
  const pool = getPool();
  const res = await pool.query(
    `SELECT sku, produto_nome AS "produtoNome", user_id AS "userId", user_name AS "userName", unidade, clicked_at AS "clickedAt"
     FROM exchanges ORDER BY clicked_at DESC`
  );
  await pool.end();
  return res.rows;
};

const listExchangesByUnit = async (unidade) => {
  const pool = getPool();
  const res = await pool.query(
    `SELECT sku, produto_nome AS "produtoNome", user_id AS "userId", user_name AS "userName", unidade, clicked_at AS "clickedAt"
     FROM exchanges WHERE unidade = $1 ORDER BY clicked_at DESC`,
    [unidade]
  );
  await pool.end();
  return res.rows;
};

const deleteExchange = async (sku, unidade) => {
  const pool = getPool();
  await pool.query(`DELETE FROM exchanges WHERE sku = $1 AND unidade = $2`, [sku, unidade]);
  await pool.end();
  return true;
};

// ==================== CATALOG (estoque.csv - sempre CSV) ====================

const ensureDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
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

const getProductFromCatalog = (sku) => {
  ensureCatalogFile();
  const products = readCsv(CATALOG_FILE, ';');
  const found = products.find(p => p.Produto === sku);
  if (found) {
    const descKey = Object.keys(found).find(k => k.includes('Descri'));
    const nome = descKey ? found[descKey] : '';
    return { sku: found.Produto, nome };
  }
  return null;
};

const addProductToCatalog = ({ sku, nome }) => {
  ensureCatalogFile();
  let products = readCsv(CATALOG_FILE, ';');
  products = products.filter(p => p.Produto !== sku);

  const descKey = products.length > 0
    ? Object.keys(products[0]).find(k => k.includes('Descri')) || 'Descrição'
    : 'Descrição';

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
  ensureCatalogFile();
  const products = readCsv(CATALOG_FILE, ';');
  return products.map(p => {
    const descKey = Object.keys(p).find(k => k.includes('Descri'));
    return {
      sku: p.Produto,
      nome: descKey ? p[descKey] : ''
    };
  });
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
