const { Pool } = require('pg');

// Neon/Render exigem SSL; um Postgres local (testes) não tem SSL habilitado.
const isLocal = (connectionString) => /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);

const poolConfig = (connectionString) => ({
  connectionString,
  ssl: isLocal(connectionString) ? false : { rejectUnauthorized: false }
});

// Um único Pool por connection string, reaproveitado durante toda a vida do processo.
// Antes cada query criava um Pool e fazia end() — um handshake TCP+TLS por operação
// (66 handshakes num /add-lote de 66 itens) e risco de estourar o limite de conexões
// do Neon. O pool é fechado só no encerramento do processo, não a cada query.
const pools = new Map();

const getPool = () => {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL not set');
  if (!pools.has(cs)) {
    const pool = new Pool(poolConfig(cs));
    // Sem esse handler, um erro num cliente ocioso derruba o processo inteiro.
    pool.on('error', (err) => console.error('Erro em cliente ocioso do pool PG:', err.message));
    pools.set(cs, pool);
  }
  return pools.get(cs);
};

// Fecha todos os pools (usado só em testes / shutdown; produção mantém abertos).
const closeAllPools = async () => {
  for (const pool of pools.values()) {
    try { await pool.end(); } catch (_) { /* já fechado */ }
  }
  pools.clear();
};

module.exports = { getPool, poolConfig, closeAllPools };
