const { Pool } = require('pg');

const getPool = () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  return new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
};

const listProducts = async () => {
  const pool = getPool();
  const res = await pool.query(`SELECT sku AS "SKU", nome AS "NOME", to_char(validade, 'YYYY-MM-DD') AS "VALIDADE", manager_id AS "MANAGER_ID" FROM products ORDER BY validade`);
  await pool.end();
  return res.rows;
};

const addProduct = async ({ sku, nome, validade, managerId }) => {
  const pool = getPool();
  await pool.query(
    `INSERT INTO products (sku, nome, validade, manager_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (sku) DO UPDATE SET nome = EXCLUDED.nome, validade = EXCLUDED.validade, manager_id = EXCLUDED.manager_id`,
    [sku, nome, validade, managerId]
  );
  await pool.end();
  return true;
};

module.exports = { listProducts, addProduct };
