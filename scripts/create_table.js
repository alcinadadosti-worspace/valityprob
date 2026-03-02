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
  produto_nome TEXT,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  unidade TEXT NOT NULL,
  clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (sku, unidade)
);`;

// Migration: adiciona coluna produto_nome se não existir
const addProdutoNomeColumn = `
ALTER TABLE exchanges ADD COLUMN IF NOT EXISTS produto_nome TEXT;
`;

// Migration: adiciona coluna validade na tabela exchanges
const addValidadeToExchanges = `
ALTER TABLE exchanges ADD COLUMN IF NOT EXISTS validade TEXT DEFAULT '';
`;

// Migration: atualiza constraint para incluir validade
const updateExchangesConstraint = `
DO $$
BEGIN
  -- Remove constraint antiga se existir
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exchanges_sku_unidade_key') THEN
    ALTER TABLE exchanges DROP CONSTRAINT exchanges_sku_unidade_key;
  END IF;

  -- Adiciona nova constraint com validade (se não existir)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exchanges_sku_unidade_validade_key') THEN
    ALTER TABLE exchanges ADD CONSTRAINT exchanges_sku_unidade_validade_key UNIQUE (sku, unidade, validade);
  END IF;
END $$;
`;

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

    // Migration: adiciona coluna produto_nome se não existir
    try {
      await pool.query(addProdutoNomeColumn);
      console.log('Coluna `produto_nome` adicionada em exchanges (ou já existia).');
    } catch (err) {
      // Ignora erro se coluna já existe
    }

    // Migration: adiciona coluna validade em exchanges
    try {
      await pool.query(addValidadeToExchanges);
      console.log('Coluna `validade` adicionada em exchanges (ou já existia).');
    } catch (err) {
      console.log('Nota: coluna validade pode já existir.');
    }

    // Migration: atualiza constraint para incluir validade
    try {
      await pool.query(updateExchangesConstraint);
      console.log('Constraint atualizada para (sku, unidade, validade).');
    } catch (err) {
      console.log('Nota: constraint pode já estar atualizada.');
    }

  } catch (err) {
    console.error('Erro ao criar tabelas:', err.message || err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
