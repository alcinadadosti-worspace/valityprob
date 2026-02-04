const { App, ExpressReceiver } = require('@slack/bolt');
const { addProduct } = require('../storage/csvStore');
const { isValidDateString } = require('../utils/dates');

// Usamos ExpressReceiver para integrar com rotas Web personalizadas
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: '/slack/events', // Endpoint padrão para o Slack
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: receiver
});

// Slash command: /demoadd 12345 | Nome Prod | 2026-02-20
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
      text: '❌ Data inválida. Use o formato YYYY-MM-DD (ex: 2026-02-20).'
    });
    return;
  }

  try {
    addProduct({
      sku,
      nome,
      validade,
      managerId: command.user_id // Pega o ID de quem digitou o comando
    });

    await respond({
      response_type: 'in_channel', // Ou 'ephemeral' se quiser privado
      text: `✅ Demonstrador cadastrado com sucesso!\n*${nome}* (SKU: ${sku}) vence em ${validade}.`
    });
  } catch (error) {
    console.error(error);
    await respond('❌ Erro ao salvar o produto.');
  }
});

module.exports = { app, receiver };