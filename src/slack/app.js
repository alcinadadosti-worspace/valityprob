const { App, ExpressReceiver } = require('@slack/bolt');
const { addProduct, addExchange, getExchange } = require('../storage');
const { isValidDateString } = require('../utils/dates');
const { getAllUnits, getUnitBySlackId } = require('../config/unitsHelper');

// Verifica se existe um token que parece real
const token = process.env.SLACK_BOT_TOKEN;
const hasValidToken = token && token.startsWith('xoxb-');

// O Receiver é a parte "Web" (Express). Pode existir mesmo sem o Bot.
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET || 'segredo-temporario-para-teste',
  endpoints: '/slack/events',
});

let app = null;

if (hasValidToken) {
  app = new App({
    token: token,
    receiver: receiver
  });

  // --- Comando /demoadd ---
  app.command('/demoadd', async ({ command, ack, respond }) => {
    await ack();
    const args = command.text.split('|').map(s => s.trim());

    if (args.length < 3) {
      await respond({
        response_type: 'ephemeral',
        text: '❌ Formato inválido. Use: `/demoadd SKU | Nome | YYYY-MM-DD | unidade`\nExemplo: `/demoadd 12345 | Perfume X | 2026-03-15 | vd-palmeira`'
      });
      return;
    }

    const [sku, nome, validade, unidadeArg] = args;

    if (!isValidDateString(validade)) {
      await respond({
        response_type: 'ephemeral',
        text: '❌ Data inválida. Use o formato YYYY-MM-DD.'
      });
      return;
    }

    let unidade = unidadeArg;
    if (!unidade) {
      const userUnit = getUnitBySlackId(command.user_id);
      if (userUnit) {
        unidade = userUnit.id;
      } else {
        const units = getAllUnits();
        const unitsList = units.map(u => `\`${u.id}\` - ${u.name}`).join('\n');
        await respond({
          response_type: 'ephemeral',
          text: `❌ Unidade não especificada e seu usuário não está associado a nenhuma unidade.\n\nUnidades disponíveis:\n${unitsList}\n\nUse: \`/demoadd SKU | Nome | YYYY-MM-DD | unidade\``
        });
        return;
      }
    }

    const units = getAllUnits();
    const validUnit = units.find(u => u.id === unidade);
    if (!validUnit) {
      const unitsList = units.map(u => `\`${u.id}\` - ${u.name}`).join('\n');
      await respond({
        response_type: 'ephemeral',
        text: `❌ Unidade "${unidade}" não encontrada.\n\nUnidades disponíveis:\n${unitsList}`
      });
      return;
    }

    try {
      await addProduct({ sku, nome, validade, unidade });
      await respond({
        response_type: 'in_channel',
        text: `✅ Demonstrador cadastrado com sucesso!\n*${nome}* (SKU: ${sku}) vence em ${validade}.\n📍 Unidade: ${validUnit.name}`
      });
    } catch (error) {
      console.error(error);
      await respond('❌ Erro ao salvar o produto.');
    }
  });

  // --- Handler do botão "Trocar" ---
  app.action(/^trocar_/, async ({ body, ack, client, action }) => {
    console.log('>>> Botão Trocar recebido, fazendo ack...');
    await ack();
    console.log('>>> ack() concluído');

    // Processa o resto em background para não bloquear
    processExchange(body, client, action).catch(err => {
      console.error('Erro no processamento do exchange:', err);
    });
  });
}

// Função separada para processar o exchange (não bloqueia o ack)
async function processExchange(body, client, action) {
  console.log('=== PROCESSANDO EXCHANGE ===');

  try {
    const { sku, unidade } = JSON.parse(action.value);
    const userId = body.user.id;

    console.log('SKU:', sku);
    console.log('Unidade:', unidade);
    console.log('User ID:', userId);

    // Busca o nome real do usuário via API do Slack
    let userName = userId;
    try {
      const userInfo = await client.users.info({ user: userId });
      userName = userInfo.user?.real_name || userInfo.user?.name || userId;
      console.log('Nome do usuário:', userName);
    } catch (userErr) {
      console.warn('Não foi possível obter nome do usuário:', userErr.message);
    }

    // Extrai o nome do produto do block text
    let produtoNome = '';
    const blocks = body.message?.blocks || [];
    for (const block of blocks) {
      if (block.accessory && block.accessory.action_id === `trocar_${sku}`) {
        const text = block.text?.text || '';
        const match = text.match(/^\*(.+?)\*/);
        if (match) produtoNome = match[1];
        break;
      }
    }
    console.log('Produto:', produtoNome);

    // Verifica se já foi trocado
    const existing = await getExchange(sku, unidade);
    if (existing) {
      console.log('Produto já foi trocado por:', existing.userName);
      try {
        await client.chat.update({
          channel: body.channel.id,
          ts: body.message.ts,
          text: body.message.text,
          blocks: updateBlocksWithConfirmation(body.message.blocks, sku, existing.userName, existing.clickedAt)
        });
      } catch (updateErr) {
        console.error('Erro ao atualizar mensagem:', updateErr.message);
      }
      return;
    }

    // Salva o exchange
    console.log('Salvando exchange no banco...');
    await addExchange({ sku, produtoNome, userId, userName, unidade });
    console.log('Exchange salvo!');

    // Atualiza a mensagem
    try {
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: body.message.text,
        blocks: updateBlocksWithConfirmation(body.message.blocks, sku, userName)
      });
      console.log('Mensagem atualizada!');
    } catch (updateErr) {
      console.error('Erro ao atualizar mensagem:', updateErr.message);
    }

    console.log(`✅ Exchange completo: SKU ${sku}, User ${userName}`);

  } catch (error) {
    console.error('❌ Erro no processExchange:', error);
    console.error('Stack:', error.stack);
  }
}

// Atualiza os blocks para mostrar confirmação
function updateBlocksWithConfirmation(blocks, sku, userName, clickedAt) {
  const options = { timeZone: 'America/Maceio', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  const timestamp = clickedAt ? new Date(clickedAt).toLocaleString('pt-BR', options) : new Date().toLocaleString('pt-BR', options);

  return blocks.map(block => {
    if (block.type === 'section' && block.accessory && block.accessory.action_id === `trocar_${sku}`) {
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${block.text.text}\n✅ *Trocado por ${userName}* em ${timestamp}`
        }
      };
    }
    return block;
  });
}

module.exports = { app, receiver };
