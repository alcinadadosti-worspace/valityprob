const { getPool } = require('./pgPool');

// Colunas da primary key de uma tabela, em ordem alfabética.
// ON CONFLICT casa pelo CONJUNTO de colunas, então a ordem declarada não importa.
// O cast para text[] é necessário: o driver pg não converte name[] em array JS.
const PK_COLUMNS_SQL = `
  SELECT COALESCE(
    (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
       FROM pg_constraint c
       JOIN unnest(c.conkey) k ON TRUE
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
      WHERE c.conrelid = $1::regclass AND c.contype = 'p'
      GROUP BY c.oid),
    ARRAY[]::text[]
  ) AS cols
`;

const getPkColumns = async (pool, table) => {
  const { rows } = await pool.query(PK_COLUMNS_SQL, [table]);
  return rows[0].cols;
};

const runMigrations = async () => {
  if (!process.env.DATABASE_URL) {
    console.log('📁 Usando armazenamento CSV (DATABASE_URL não configurada)');
    return;
  }

  console.log('🔄 Verificando migrações do banco de dados...');
  const pool = getPool();

  try {
    // A chave é (sku, unidade): o mesmo SKU existe em várias lojas ao mesmo tempo.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        sku TEXT NOT NULL,
        nome TEXT NOT NULL,
        validade DATE NOT NULL,
        unidade TEXT NOT NULL,
        PRIMARY KEY (sku, unidade)
      )
    `);

    // Bancos antigos têm a PK só em (sku), o que fazia uma loja sobrescrever o item de
    // outra ao cadastrar o mesmo SKU (o item mudava de loja silenciosamente). A tabela de
    // produção foi criada à mão no Neon, então tratamos QUALQUER PK diferente do alvo
    // (inclusive nenhuma): dropa a que existir e cria (sku, unidade). Se houver duplicatas
    // reais de (sku, unidade) o ADD falha e o boot é abortado — falha segura, não corrompe.
    const pkBefore = await getPkColumns(pool, 'products');
    const isTargetPk = pkBefore.length === 2 && pkBefore[0] === 'sku' && pkBefore[1] === 'unidade';
    if (!isTargetPk) {
      console.log(`🔧 products: ajustando PK de (${pkBefore.join(', ') || 'nenhuma'}) para (sku, unidade)...`);
      await pool.query(`
        DO $$
        DECLARE pk_name TEXT;
        BEGIN
          SELECT conname INTO pk_name FROM pg_constraint
           WHERE conrelid = 'products'::regclass AND contype = 'p';
          IF pk_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE products DROP CONSTRAINT %I', pk_name);
          END IF;
          ALTER TABLE products ADD PRIMARY KEY (sku, unidade);
        END $$
      `);
    }

    // Sem a chave (sku, unidade) o ON CONFLICT do addProduct falha e NENHUM cadastro
    // é salvo. Não deixe isso passar em silêncio.
    const pkAfter = await getPkColumns(pool, 'products');
    if (!(pkAfter.length === 2 && pkAfter[0] === 'sku' && pkAfter[1] === 'unidade')) {
      throw new Error(
        `products: PK esperada (sku, unidade), encontrada (${pkAfter.join(', ') || 'nenhuma'}). ` +
        'Os cadastros vão falhar até isso ser corrigido.'
      );
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS exchanges (
        id SERIAL PRIMARY KEY,
        sku TEXT NOT NULL,
        produto_nome TEXT,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        unidade TEXT NOT NULL,
        clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: adiciona coluna validade em exchanges
    await pool.query(`ALTER TABLE exchanges ADD COLUMN IF NOT EXISTS validade TEXT DEFAULT ''`);

    // Migration: atualiza constraint para incluir validade
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exchanges_sku_unidade_key') THEN
          ALTER TABLE exchanges DROP CONSTRAINT exchanges_sku_unidade_key;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exchanges_sku_unidade_validade_key') THEN
          BEGIN
            ALTER TABLE exchanges ADD CONSTRAINT exchanges_sku_unidade_validade_key UNIQUE (sku, unidade, validade);
          EXCEPTION WHEN duplicate_table THEN
            NULL;
          END;
        END IF;
      END $$
    `);

    // Ledger de notificações: marca que o alerta de "faltam N dias" já foi enviado para
    // um (sku, unidade, validade), evitando reenvio a cada ciclo do cron.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        sku TEXT NOT NULL,
        unidade TEXT NOT NULL,
        validade TEXT NOT NULL DEFAULT '',
        notified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (sku, unidade, validade)
      )
    `);

    console.log('✅ Migrações concluídas com sucesso!');
  } catch (err) {
    console.error('🚨 FALHA NAS MIGRAÇÕES:', err.message);
    throw err;
  }
  // NÃO fecha o pool: ele é compartilhado e o app continua usando depois da migração.
};

module.exports = { runMigrations, getPkColumns };
