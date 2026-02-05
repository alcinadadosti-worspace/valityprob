const { App, ExpressReceiver } = require('@slack/bolt');
const { addProduct } = require('../storage/csvStore');
const { isValidDateString } = require('../utils/dates');

// Se não tiver token, usa um valor falso para não quebrar a inicialização
const token = process.env.SLACK_BOT_TOKEN || 'xoxb-sem-token';
const signingSecret = process.env.SLACK_SIGNING_SECRET || 'secret-vazio';

const receiver = new ExpressReceiver({
  signingSecret: signingSecret,
  endpoints: '/slack/events',
});

const app = new App({
  token: token,
  receiver: receiver,
  // Isso impede que o bot tente testar a conexão ao iniciar se o token for falso
  skipWebTokenVerification: true 
});

// Slash command: /demoadd
app.command('/demoadd', async ({ command, ack, respond }) => {
  await ack();
  // ... (código do comando continua igual, só vai funcionar se tiver token real)
  const args = command.text.split('|').map(s => s.trim());
  if (args.length !== 3) {
    await respond({ response_type: 'ephemeral', text: '❌ Formato inválido.' });
    return;
  }
  const [sku, nome, validade] = args;
  
  try {
    addProduct({ sku, nome, validade, managerId: command.user_id });
    await respond({ response_type: 'in_channel', text: `✅ Demonstrador ${nome} cadastrado!` });
  } catch (error) {
    await respond('❌ Erro ao salvar.');
  }
});

module.exports = { app, receiver };