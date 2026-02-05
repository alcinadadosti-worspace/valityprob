const { App, ExpressReceiver } = require('@slack/bolt');
const { addProduct } = require('../storage');
const { isValidDateString } = require('../utils/dates');

// Verifica se existe um token que parece real (começa com xoxb-)
const token = process.env.SLACK_BOT_TOKEN;
const hasValidToken = token && token.startsWith('xoxb-');

// O Receiver é a parte "Web" (Express). Ele pode existir mesmo sem o Bot.
// Usamos um segredo falso se não houver um real, só para o servidor subir.
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET || 'segredo-temporario-para-teste',
  endpoints: '/slack/events',
});

let app = null;

if (hasValidToken) {
  // SÓ inicializa o Bolt se tiver token real
  app = new App({
    token: token,
    receiver: receiver
  });

  // --- Definição dos Comandos do Slack ---
  app.command('/demoadd', async ({ command, ack, respond }) => {
    await ack();
    const args = command.text.split('|').map(s => s.trim());

    if (args.length !== 3) {
      await respond({
        response_type: 'ephemeral',
        text: '❌ Formato inválido. Use: `/demoadd SKU | Nome | YYYY-MM-DD`'
      });
      return;
    }

    const [sku, nome, validade] = args;

    if (!isValidDateString(validade)) {
      await respond({
        response_type: 'ephemeral',
        text: '❌ Data inválida. Use o formato YYYY-MM-DD.'
      });
      return;
    }

    try {
      addProduct({
        sku,
        nome,
        validade,
        managerId: command.user_id
      });

      await respond({
        response_type: 'in_channel',
        text: `✅ Demonstrador cadastrado com sucesso!\n*${nome}* (SKU: ${sku}) vence em ${validade}.`
      });
    } catch (error) {
      console.error(error);
      await respond('❌ Erro ao salvar o produto.');
    }
  });
}

// Exporta o app (que pode ser null) e o receiver (que sempre existe)
module.exports = { app, receiver };