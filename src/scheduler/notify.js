const cron = require('node-cron');
const { listProducts } = require('../storage/csvStore');
const { parseDate, daysUntil, TIMEZONE, getToday } = require('../utils/dates');

// Memória simples para evitar duplicação no mesmo ciclo de vida do processo
// Formato: { '2026-02-04-08': true }
const executionHistory = new Set();

const scheduleNotifications = (app) => {
  // Horários: 08:00, 12:00, 15:00, 17:00
  // Cron syntax: minuto hora dia_mes mes dia_semana
  const times = ['0 8 * * *', '0 12 * * *', '0 15 * * *', '0 17 * * *'];

  times.forEach((timeExpression) => {
    cron.schedule(timeExpression, async () => {
      console.log(`⏰ Executando job de notificação: ${timeExpression}`);
      await runNotificationJob(app);
    }, {
      timezone: TIMEZONE
    });
  });
};

const runNotificationJob = async (app) => {
  const now = getToday(); // Data atual no timezone correto
  const currentHour = new Date().toLocaleTimeString('pt-BR', { timeZone: TIMEZONE, hour: '2-digit' });
  const runKey = `${now.toISODate()}-${currentHour}`;

  // Trava de duplicidade em memória
  if (executionHistory.has(runKey)) {
    console.log(`Job já executado hoje neste horário (${runKey}). Pulando.`);
    return;
  }

  try {
    const products = listProducts();
    const alertsByManager = {};

    // 1. Filtrar produtos que vencem em exatos 7 dias
    products.forEach(p => {
      const expiryDate = parseDate(p.VALIDADE);
      const days = daysUntil(expiryDate);

      // Regra: Exatamente 7 dias
      if (days === 7) {
        if (!alertsByManager[p.MANAGER_ID]) {
          alertsByManager[p.MANAGER_ID] = [];
        }
        alertsByManager[p.MANAGER_ID].push(p);
      }
    });

    // 2. Enviar DMs consolidadas
    for (const [managerId, items] of Object.entries(alertsByManager)) {
      if (items.length === 0) continue;

      let msgText = `⚠️ *Lembrete: faltam 7 dias para vencer ${items.length} demonstrador(es):*\n\n`;
      
      items.forEach(item => {
        msgText += `• *SKU ${item.SKU}* — ${item.NOME} — vence em ${item.VALIDADE}\n`;
      });

      try {
        await app.client.chat.postMessage({
          channel: managerId,
          text: msgText,
          mrkdwn: true
        });
        console.log(`Mensagem enviada para ${managerId} com ${items.length} itens.`);
      } catch (slackError) {
        console.error(`Erro ao enviar mensagem para ${managerId}:`, slackError.message);
      }
    }

    // Registra sucesso para travar reexecução
    executionHistory.add(runKey);

    // Limpeza simples do histórico (opcional, para não crescer infinitamente)
    if (executionHistory.size > 20) executionHistory.clear();

  } catch (error) {
    console.error('Erro no job de notificação:', error);
  }
};

module.exports = { scheduleNotifications };