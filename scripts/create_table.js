const { Pool } = require('pg');

const createProductsTable = `
CREATE TABLE IF NOT EXISTS products (
  sku TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  validade DATE NOT NULL,
  unidade TEXT NOT NULL
);`;

const createExchangesTable = `
CREATE TABLE IF NOT EXISTS exchanges (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  unidade TEXT NOT NULL,
  clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (sku, unidade)
);`;

// Migration: adiciona coluna unidade se não existir (para bancos existentes)
const addUnidadeColumn = `
ALTER TABLE products ADD COLUMN IF NOT EXISTS unidade TEXT;
`;

// Migration: remove coluna manager_id se existir
const dropManagerIdColumn = `
ALTER TABLE products DROP COLUMN IF EXISTS manager_id;
`;

(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set. Set the env var and re-run this script.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

  try {
    // Cria tabela products (nova estrutura)
    await pool.query(createProductsTable);
    console.log('Tabela `products` criada/confirmada com sucesso.');

    // Migration: adiciona coluna unidade se não existir
    try {
      await pool.query(addUnidadeColumn);
      console.log('Coluna `unidade` adicionada (ou já existia).');
    } catch (err) {
      // Ignora erro se coluna já existe
    }

    // Migration: remove coluna manager_id se existir
    try {
      await pool.query(dropManagerIdColumn);
      console.log('Coluna `manager_id` removida (ou não existia).');
    } catch (err) {
      // Ignora erro
    }

    // Cria tabela exchanges
    await pool.query(createExchangesTable);
    console.log('Tabela `exchanges` criada/confirmada com sucesso.');

  } catch (err) {
    console.error('Erro ao criar tabelas:', err.message || err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
