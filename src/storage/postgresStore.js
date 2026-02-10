const { Pool } = require('pg');

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

const addExchange = async ({ sku, userId, userName, unidade }) => {
  const pool = getPool();
  await pool.query(
    `INSERT INTO exchanges (sku, user_id, user_name, unidade) VALUES ($1, $2, $3, $4)
     ON CONFLICT (sku, unidade) DO UPDATE SET user_id = EXCLUDED.user_id, user_name = EXCLUDED.user_name, clicked_at = CURRENT_TIMESTAMP`,
    [sku, userId, userName, unidade]
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
    `SELECT sku, user_id AS "userId", user_name AS "userName", unidade, clicked_at AS "clickedAt"
     FROM exchanges WHERE sku = $1 AND unidade = $2`,
    [sku, unidade]
  );
  await pool.end();
  return res.rows[0] || null;
};

const listExchanges = async () => {
  const pool = getPool();
  const res = await pool.query(
    `SELECT sku, user_id AS "userId", user_name AS "userName", unidade, clicked_at AS "clickedAt"
     FROM exchanges ORDER BY clicked_at DESC`
  );
  await pool.end();
  return res.rows;
};

const listExchangesByUnit = async (unidade) => {
  const pool = getPool();
  const res = await pool.query(
    `SELECT sku, user_id AS "userId", user_name AS "userName", unidade, clicked_at AS "clickedAt"
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
  deleteExchange
};
