require('dotenv').config();
const { app, receiver } = require('./slack/app');
const webRoutes = require('./routes/web');
const { scheduleNotifications } = require('./scheduler/notify');
const express = require('express');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Função para rodar migrações do banco de dados automaticamente
async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('📁 Usando armazenamento CSV (DATABASE_URL não configurada)');
    return;
  }

  console.log('🔄 Verificando migrações do banco de dados...');

  try {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

    // Cria tabelas se não existirem
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        sku TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        validade DATE NOT NULL,
        unidade TEXT NOT NULL
      )
    `);

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

    await pool.end();
    console.log('✅ Migrações concluídas com sucesso!');
  } catch (err) {
    console.error('⚠️ Erro nas migrações (continuando mesmo assim):', err.message);
  }
}

// Configura rotas da Web no ExpressReceiver
// (Isso funciona independente do Bot estar ativo)
// Servir arquivos estáticos (CSS/JS) colocados em src/public (prioritário)
receiver.router.use('/public', express.static(path.join(__dirname, 'public')));
// Fallback: também aceite um diretório /public na raiz do repositório (compatibilidade)
receiver.router.use('/public', express.static(path.join(__dirname, '..', 'public')));

// PWA: Servir service worker e manifest na raiz (necessário para escopo correto)
receiver.router.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

receiver.router.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

receiver.router.use('/', webRoutes);

// Servir logo a partir de src/public/logo.png se existir, senão procurar na raiz
const fs = require('fs');
receiver.router.get('/public/logo.png', (req, res) => {
  const fromSrc = path.join(__dirname, 'public', 'logo.png');
  const fromRoot = path.join(__dirname, '..', 'ChatGPT Image 9 de jan. de 2026, 09_03_28.png');
  if (fs.existsSync(fromSrc)) return res.sendFile(fromSrc);
  if (fs.existsSync(fromRoot)) return res.sendFile(fromRoot);
  res.status(404).end();
});

receiver.router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Função principal de inicialização
(async () => {
  // Roda migrações do banco antes de iniciar
  await runMigrations();

  if (app) {
    // --- CENÁRIO 1: TUDO CONFIGURADO ---
    try {
      await app.start(PORT);
      scheduleNotifications(app);
      console.log(`⚡️ MODO COMPLETO: Bot + Site rodando na porta ${PORT}!`);
      console.log(`🌎 Timezone: ${process.env.TZ || 'Sistema'}`);
    } catch (error) {
      console.error('❌ Falha ao iniciar o Bot:', error);
    }
  } else {
    // --- CENÁRIO 2: SÓ O SITE (SEM SLACK) ---
    // Como 'app' é null, iniciamos o servidor web manualmente através do receiver
    receiver.app.listen(PORT, () => {
      console.log(`⚠️ MODO WEB APENAS (Sem Slack Token)`);
      console.log(`🌐 Site de cadastro rodando na porta ${PORT}`);
      console.log(`ℹ️ O bot e as notificações NÃO estão ativos.`);
    });
  }
})();