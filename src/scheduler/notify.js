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

    // 2. Enviar DMs consolidadas usando helper para montar payload e enviar
    for (const [managerId, items] of Object.entries(alertsByManager)) {
      if (items.length === 0) continue;
      try {
        await sendAlertsToManager(app, managerId, items);
        console.log(`Mensagem enviada para ${managerId} com ${items.length} itens.`);
      } catch (err) {
        console.error(`Falha ao enviar alertas para ${managerId}:`, err && (err.data && err.data.error) || err.message || err);
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

// Constroi o payload (texto e blocks) usado nas mensagens de alerta
const buildAlertPayload = (items) => {
  const textFallback = `⚠️ Lembrete: faltam ${items.length} demonstrador(es) que vencem em 7 dias.`;

  const blocks = [];
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `:warning: *Lembrete de validade — faltam 7 dias*\nForam encontrados *${items.length}* demonstrador(es) que vencem em 7 dias.` } });
  blocks.push({ type: 'divider' });

  items.forEach(item => {
    const line = `*${item.NOME}* — SKU ${item.SKU} — vence em ${item.VALIDADE}`;
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `• ${line}` } });
  });

  blocks.push({ type: 'divider' });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Envio automático — verifique o demonstrador e atualize o estoque se necessário.' }] });

  return { text: textFallback, blocks };
};

// Envia DM para um manager (usa postMessage direto e realiza fallbacks)
const sendAlertsToManager = async (app, managerId, items) => {
  const payload = buildAlertPayload(items);

  // Tenta postar diretamente usando user id
  try {
    await app.client.chat.postMessage({ channel: managerId, text: payload.text, blocks: payload.blocks });
    return;
  } catch (postErr) {
    const errCode = postErr && postErr.data && postErr.data.error;
    console.warn(`postMessage direto falhou para ${managerId}:`, errCode || postErr.message || postErr);
  }

  // Fallback para conversations.open
  if (app.client && app.client.conversations && typeof app.client.conversations.open === 'function') {
    try {
      const conv = await app.client.conversations.open({ users: managerId });
      const channelId = conv && conv.channel && conv.channel.id;
      if (channelId) {
        await app.client.chat.postMessage({ channel: channelId, text: payload.text, blocks: payload.blocks });
        return;
      }
    } catch (openErr) {
      console.error(`conversations.open falhou para ${managerId}:`, openErr && (openErr.data && openErr.data.error) || openErr.message || openErr);
    }
  }

  // Fallback legacy im.open
  if (app.client && app.client.im && typeof app.client.im.open === 'function') {
    try {
      const conv2 = await app.client.im.open({ user: managerId });
      const channelId2 = conv2 && conv2.channel && conv2.channel.id;
      if (channelId2) {
        await app.client.chat.postMessage({ channel: channelId2, text: payload.text, blocks: payload.blocks });
        return;
      }
    } catch (imErr) {
      console.error(`im.open falhou para ${managerId}:`, imErr && (imErr.data && imErr.data.error) || imErr.message || imErr);
    }
  }

  throw new Error('Não foi possível abrir canal/DM para o usuário');
};

module.exports = { scheduleNotifications, runNotificationJob, buildAlertPayload, sendAlertsToManager };