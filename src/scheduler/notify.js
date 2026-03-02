const cron = require('node-cron');
const { listProducts, hasExchange } = require('../storage');
const { parseDate, daysUntil, TIMEZONE, getToday } = require('../utils/dates');
const { getAllUnits, getMemberSlackIds, getUnitById } = require('../config/unitsHelper');

// Memória simples para evitar duplicação no mesmo ciclo de vida do processo
const executionHistory = new Set();

const scheduleNotifications = (app) => {
  // Horários: 08:00, 12:00, 15:00, 17:00
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
  const now = getToday();
  const currentHour = new Date().toLocaleTimeString('pt-BR', { timeZone: TIMEZONE, hour: '2-digit' });
  const runKey = `${now.toISODate()}-${currentHour}`;

  if (executionHistory.has(runKey)) {
    console.log(`Job já executado hoje neste horário (${runKey}). Pulando.`);
    return;
  }

  try {
    const products = await listProducts();
    const alertsByUnit = {};

    // 1. Filtrar produtos que vencem em exatos 7 dias e agrupar por unidade
    for (const p of products) {
      const expiryDate = parseDate(p.VALIDADE);
      const days = daysUntil(expiryDate);

      if (days === 7) {
        const unidade = p.UNIDADE;
        if (!unidade) continue;

        // Verifica se já foi trocado (agora considera a validade)
        const exchanged = await hasExchange(p.SKU, unidade, p.VALIDADE);
        if (exchanged) {
          console.log(`Produto ${p.SKU} (validade ${p.VALIDADE}) já foi trocado na unidade ${unidade}. Pulando.`);
          continue;
        }

        if (!alertsByUnit[unidade]) {
          alertsByUnit[unidade] = [];
        }
        alertsByUnit[unidade].push(p);
      }
    }

    // 2. Enviar DMs para TODOS os membros de cada unidade
    for (const [unidade, items] of Object.entries(alertsByUnit)) {
      if (items.length === 0) continue;

      const memberSlackIds = getMemberSlackIds(unidade);
      if (memberSlackIds.length === 0) {
        console.warn(`Nenhum membro configurado para a unidade ${unidade}`);
        continue;
      }

      for (const slackUserId of memberSlackIds) {
        try {
          await sendAlertsToMember(app, slackUserId, items, unidade);
          console.log(`Mensagem enviada para ${slackUserId} (unidade: ${unidade}) com ${items.length} itens.`);
        } catch (err) {
          console.error(`Falha ao enviar alertas para ${slackUserId}:`, err?.data?.error || err.message || err);
        }
      }
    }

    executionHistory.add(runKey);
    if (executionHistory.size > 20) executionHistory.clear();

  } catch (error) {
    console.error('Erro no job de notificação:', error);
  }
};

// Constroi o payload com botões "Trocar"
const buildAlertPayload = (items, unidade) => {
  const unit = getUnitById(unidade);
  const unitName = unit ? unit.name : unidade;
  const textFallback = `⚠️ Lembrete: ${items.length} demonstrador(es) da ${unitName} vencem em 7 dias.`;

  const blocks = [];

  // Header
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `:warning: *Lembrete de validade — faltam 7 dias*\n*Unidade:* ${unitName}\nForam encontrados *${items.length}* demonstrador(es) que vencem em 7 dias.`
    }
  });
  blocks.push({ type: 'divider' });

  // Itens com botão "Trocar"
  items.forEach(item => {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${item.NOME}*\nSKU: ${item.SKU} | Vence em: ${item.VALIDADE}`
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Trocar', emoji: true },
        style: 'primary',
        action_id: `trocar_${item.SKU}`,
        value: JSON.stringify({ sku: item.SKU, unidade: unidade, validade: item.VALIDADE })
      }
    });
  });

  blocks.push({ type: 'divider' });

  // Link para ver itens da unidade
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  blocks.push({
    type: 'actions',
    elements: [{
      type: 'button',
      text: { type: 'plain_text', text: 'Ver todos os itens da unidade', emoji: true },
      url: `${appUrl}/items?unidade=${unidade}`
    }]
  });

  // Footer
  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: 'Clique em "Trocar" para marcar o demonstrador como trocado e parar os alertas.'
    }]
  });

  return { text: textFallback, blocks };
};

// Envia DM para um membro específico
const sendAlertsToMember = async (app, slackUserId, items, unidade) => {
  const payload = buildAlertPayload(items, unidade);

  // Tenta postar diretamente
  try {
    await app.client.chat.postMessage({
      channel: slackUserId,
      text: payload.text,
      blocks: payload.blocks
    });
    return;
  } catch (postErr) {
    const errCode = postErr?.data?.error;
    console.warn(`postMessage direto falhou para ${slackUserId}:`, errCode || postErr.message || postErr);
  }

  // Fallback: conversations.open
  if (app.client?.conversations?.open) {
    try {
      const conv = await app.client.conversations.open({ users: slackUserId });
      const channelId = conv?.channel?.id;
      if (channelId) {
        await app.client.chat.postMessage({
          channel: channelId,
          text: payload.text,
          blocks: payload.blocks
        });
        return;
      }
    } catch (openErr) {
      console.error(`conversations.open falhou para ${slackUserId}:`, openErr?.data?.error || openErr.message || openErr);
    }
  }

  // Fallback legacy: im.open
  if (app.client?.im?.open) {
    try {
      const conv2 = await app.client.im.open({ user: slackUserId });
      const channelId2 = conv2?.channel?.id;
      if (channelId2) {
        await app.client.chat.postMessage({
          channel: channelId2,
          text: payload.text,
          blocks: payload.blocks
        });
        return;
      }
    } catch (imErr) {
      console.error(`im.open falhou para ${slackUserId}:`, imErr?.data?.error || imErr.message || imErr);
    }
  }

  throw new Error('Não foi possível abrir canal/DM para o usuário');
};

module.exports = {
  scheduleNotifications,
  runNotificationJob,
  buildAlertPayload,
  sendAlertsToMember
};
