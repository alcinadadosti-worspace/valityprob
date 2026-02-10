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
  // Formato: /demoadd SKU | Nome | YYYY-MM-DD | unidade (opcional)
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

    // Se unidade não foi passada, tenta descobrir pela unidade do usuário
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

    // Valida se unidade existe
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
    await ack();

    try {
      const { sku, unidade } = JSON.parse(action.value);
      const userId = body.user.id;
      const userName = body.user.name || body.user.username || userId;

      // Verifica se já foi trocado
      const existing = await getExchange(sku, unidade);
      if (existing) {
        // Já foi trocado - apenas atualiza a mensagem
        await client.chat.update({
          channel: body.channel.id,
          ts: body.message.ts,
          text: body.message.text,
          blocks: updateBlocksWithConfirmation(body.message.blocks, sku, existing.userName, existing.clickedAt)
        });
        return;
      }

      // Salva o exchange
      await addExchange({ sku, userId, userName, unidade });

      // Atualiza a mensagem original
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: body.message.text,
        blocks: updateBlocksWithConfirmation(body.message.blocks, sku, userName)
      });

      console.log(`Exchange registrado: SKU ${sku}, Unidade ${unidade}, User ${userName}`);

    } catch (error) {
      console.error('Erro ao processar botão Trocar:', error);
    }
  });
}

// Atualiza os blocks para mostrar confirmação no lugar do botão
function updateBlocksWithConfirmation(blocks, sku, userName, clickedAt) {
  const timestamp = clickedAt ? new Date(clickedAt).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');

  return blocks.map(block => {
    // Se é o block do item com o botão que foi clicado
    if (block.type === 'section' && block.accessory && block.accessory.action_id === `trocar_${sku}`) {
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${block.text.text}\n✅ *Trocado por ${userName}* em ${timestamp}`
        }
        // Remove o accessory (botão)
      };
    }
    return block;
  });
}

module.exports = { app, receiver };
