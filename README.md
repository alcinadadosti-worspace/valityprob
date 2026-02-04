# Slack Validade Bot

Bot para gerenciar validade de demonstradores/provadores e notificar gerentes 7 dias antes do vencimento.

## Configuração do Slack App

1. Acesse [api.slack.com/apps](https://api.slack.com/apps) e crie um novo App ("From scratch").
2. **OAuth & Permissions**:
   - Adicione os seguintes **Bot Token Scopes**:
     - `chat:write` (Para enviar mensagens)
     - `commands` (Para criar slash commands)
     - `im:write` (Para iniciar DMs)
   - Instale o App no Workspace e copie o `Bot User OAuth Token`.
3. **Basic Information**:
   - Copie o `Signing Secret`.
4. **Slash Commands**:
   - Crie um novo comando: `/demoadd`
   - Request URL: `https://SEU-APP-NO-RENDER.onrender.com/slack/events`
   - Descrição: Cadastra um demonstrador
   - Usage hint: `SKU | Nome | YYYY-MM-DD`
5. **Event Subscriptions** (Obrigatório para o Bolt funcionar via HTTP):
   - Ative Events.
   - Request URL: `https://SEU-APP-NO-RENDER.onrender.com/slack/events` (O Slack vai verificar esta URL).
   - *Nota:* Você só consegue validar a URL depois que o deploy estiver rodando.

## Rodando Localmente

1. Clone o repositório.
2. `npm install`
3. Copie `.env.example` para `.env` e preencha as chaves.
4. `npm run dev`
5. O servidor rodará em `http://localhost:3000`.

## Deploy no Render

1. Crie um novo **Web Service** no Render conectado ao seu repositório Git.
2. Runtime: **Node**.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Adicione as variáveis de ambiente (`Environment Variables`):
   - `SLACK_BOT_TOKEN`: (Seu token xoxb-...)
   - `SLACK_SIGNING_SECRET`: (Seu signing secret)
   - `TZ`: `America/Maceio`
6. Após o deploy, pegue a URL pública do Render e atualize no painel do Slack (Slash Commands e Event Subscriptions).

## Uso

### Via Slack
Comando: `/demoadd 12345 | Perfume X | 2026-03-15`

### Via Web
Acesse a URL raiz do projeto (`/`) para ver o formulário de cadastro. Você precisará do "Slack Member ID" (disponível no perfil do usuário no Slack -> Copiar ID).

## Funcionamento das Notificações
O bot verifica 4 vezes ao dia (08h, 12h, 15h, 17h - Horário de Maceió) se há produtos vencendo em **exatos 7 dias**. Se houver, envia uma DM para o gerente responsável.