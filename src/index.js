require('dotenv').config();
const { app, receiver } = require('./slack/app');
const webRoutes = require('./routes/web');
const { scheduleNotifications } = require('./scheduler/notify');

const PORT = process.env.PORT || 3000;

// Inicializa o Scheduler (Cron)
scheduleNotifications(app);

// Configura rotas da Web no ExpressReceiver (que é uma aplicação Express)
// O receiver expõe o Express app através de `receiver.router`
receiver.router.use('/', webRoutes);

// Endpoint de Healthcheck para o Render não dormir/verificar status
receiver.router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Inicia o servidor
(async () => {
  await app.start(PORT);
  console.log(`⚡️ Slack Validade Bot rodando na porta ${PORT}!`);
  console.log(`🌎 Timezone configurada: ${process.env.TZ || 'Sistema'}`);
})();