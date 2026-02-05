require('dotenv').config();
const { app, receiver } = require('./slack/app');
const webRoutes = require('./routes/web');
const { scheduleNotifications } = require('./scheduler/notify');
const express = require('express');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Configura rotas da Web no ExpressReceiver
// (Isso funciona independente do Bot estar ativo)
// Servir arquivos estáticos (CSS/JS) colocados em src/public
receiver.router.use('/public', express.static(path.join(__dirname, '..', 'public')));
receiver.router.use('/', webRoutes);

receiver.router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Função principal de inicialização
(async () => {
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