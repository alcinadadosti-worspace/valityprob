require('dotenv').config();
const { app, receiver } = require('./slack/app');
const webRoutes = require('./routes/web');
const { scheduleNotifications } = require('./scheduler/notify');

const PORT = process.env.PORT || 3000;

// Configura rotas da Web
receiver.router.use('/', webRoutes);

receiver.router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Função principal de inicialização
(async () => {
  const hasToken = process.env.SLACK_BOT_TOKEN && process.env.SLACK_BOT_TOKEN.startsWith('xoxb-');

  if (hasToken) {
    // MODO COMPLETO (COM SLACK)
    try {
      await app.start(PORT);
      scheduleNotifications(app);
      console.log(`⚡️ MODO BOT ATIVO: Rodando na porta ${PORT}!`);
    } catch (error) {
      console.error('❌ Erro ao conectar no Slack. Iniciando apenas modo WEB.', error.message);
      startWebOnly();
    }
  } else {
    // MODO APENAS SITE (SEM SLACK)
    console.log('⚠️ Nenhum token do Slack encontrado. Iniciando em MODO WEB APENAS.');
    startWebOnly();
  }
})();

function startWebOnly() {
  // Inicia apenas o Express (o site), ignorando o bot do Slack
  receiver.app.listen(PORT, () => {
    console.log(`🌐 MODO WEB ATIVO: Acesse o site na porta ${PORT}`);
    console.log(`⚠️ O bot do Slack e as notificações NÃO estão rodando.`);
  });
}