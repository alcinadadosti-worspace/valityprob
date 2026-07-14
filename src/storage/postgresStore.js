const { getPool } = require('./pgPool');
const catalog = require('./catalogStore');

// ==================== PRODUCTS ====================
// Chave (sku, unidade): o mesmo SKU existe em várias lojas ao mesmo tempo.

const listProducts = async () => {
  const res = await getPool().query(
    `SELECT sku AS "SKU", nome AS "NOME", to_char(validade, 'YYYY-MM-DD') AS "VALIDADE", unidade AS "UNIDADE"
     FROM products ORDER BY validade`
  );
  return res.rows;
};

const listProductsByUnit = async (unidade) => {
  const res = await getPool().query(
    `SELECT sku AS "SKU", nome AS "NOME", to_char(validade, 'YYYY-MM-DD') AS "VALIDADE", unidade AS "UNIDADE"
     FROM products WHERE unidade = $1 ORDER BY validade`,
    [unidade]
  );
  return res.rows;
};

const addProduct = async ({ sku, nome, validade, unidade }) => {
  await getPool().query(
    `INSERT INTO products (sku, nome, validade, unidade) VALUES ($1, $2, $3, $4)
     ON CONFLICT (sku, unidade) DO UPDATE SET nome = EXCLUDED.nome, validade = EXCLUDED.validade`,
    [sku, nome, validade, unidade]
  );
  return true;
};

const deleteProduct = async (sku, unidade) => {
  const res = await getPool().query(`DELETE FROM products WHERE sku = $1 AND unidade = $2`, [sku, unidade]);
  return res.rowCount > 0;
};

const updateProduct = async ({ sku, unidade, nome, validade }) => {
  const res = await getPool().query(
    `UPDATE products SET nome = COALESCE($3, nome), validade = COALESCE($4, validade)
      WHERE sku = $1 AND unidade = $2`,
    [sku, unidade, nome ?? null, validade ?? null]
  );
  return res.rowCount > 0;
};

// ==================== EXCHANGES ====================

const addExchange = async ({ sku, produtoNome, userId, userName, unidade, validade }) => {
  await getPool().query(
    `INSERT INTO exchanges (sku, produto_nome, user_id, user_name, unidade, validade, clicked_at) VALUES ($1, $2, $3, $4, $5, $6, NOW() AT TIME ZONE 'America/Maceio')
     ON CONFLICT (sku, unidade, validade) DO UPDATE SET produto_nome = EXCLUDED.produto_nome, user_id = EXCLUDED.user_id, user_name = EXCLUDED.user_name, clicked_at = NOW() AT TIME ZONE 'America/Maceio'`,
    [sku, produtoNome, userId, userName, unidade, validade || '']
  );
  return true;
};

const hasExchange = async (sku, unidade, validade) => {
  const res = await getPool().query(
    `SELECT 1 FROM exchanges WHERE sku = $1 AND unidade = $2 AND validade = $3 LIMIT 1`,
    [sku, unidade, validade]
  );
  return res.rows.length > 0;
};

const getExchange = async (sku, unidade, validade) => {
  const res = await getPool().query(
    `SELECT sku, produto_nome AS "produtoNome", user_id AS "userId", user_name AS "userName", unidade, validade,
     to_char(clicked_at, 'DD/MM/YYYY, HH24:MI') AS "clickedAt"
     FROM exchanges WHERE sku = $1 AND unidade = $2 AND validade = $3`,
    [sku, unidade, validade]
  );
  return res.rows[0] || null;
};

const listExchanges = async () => {
  const res = await getPool().query(
    `SELECT sku, produto_nome AS "produtoNome", user_id AS "userId", user_name AS "userName", unidade, validade,
     to_char(clicked_at, 'DD/MM/YYYY, HH24:MI') AS "clickedAt"
     FROM exchanges ORDER BY clicked_at DESC`
  );
  return res.rows;
};

const listExchangesByUnit = async (unidade) => {
  const res = await getPool().query(
    `SELECT sku, produto_nome AS "produtoNome", user_id AS "userId", user_name AS "userName", unidade, validade,
     to_char(clicked_at, 'DD/MM/YYYY, HH24:MI') AS "clickedAt"
     FROM exchanges WHERE unidade = $1 ORDER BY clicked_at DESC`,
    [unidade]
  );
  return res.rows;
};

const deleteExchange = async (sku, unidade, validade) => {
  await getPool().query(`DELETE FROM exchanges WHERE sku = $1 AND unidade = $2 AND validade = $3`, [sku, unidade, validade]);
  return true;
};

// ==================== NOTIFICATIONS (ledger de alertas enviados) ====================
// Registra que já mandamos o alerta de "faltam N dias" para um (sku, unidade, validade).
// Evita reenviar todo ciclo do cron e permite pegar o item mesmo se o servidor perdeu
// o dia exato (o filtro passou a ser days <= limite, não days === limite).

const hasNotified = async (sku, unidade, validade) => {
  const res = await getPool().query(
    `SELECT 1 FROM notifications WHERE sku = $1 AND unidade = $2 AND validade = $3 LIMIT 1`,
    [sku, unidade, validade]
  );
  return res.rows.length > 0;
};

const addNotified = async ({ sku, unidade, validade }) => {
  await getPool().query(
    `INSERT INTO notifications (sku, unidade, validade, notified_at) VALUES ($1, $2, $3, NOW() AT TIME ZONE 'America/Maceio')
     ON CONFLICT (sku, unidade, validade) DO NOTHING`,
    [sku, unidade, validade || '']
  );
  return true;
};

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
