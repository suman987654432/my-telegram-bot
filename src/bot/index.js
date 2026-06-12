const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const { handleMessage } = require('./handlers');
const { handleCallbackQuery } = require('./callbacks');
const { handleAdminCommand } = require('./admin');
const { checkRateLimit } = require('../middleware/rate-limiter');
const logger = require('../utils/logger');

let bot;

if (config.NODE_ENV === 'production' && config.WEBHOOK_URL) {
  // Webhook mode: do not run long polling
  bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: false });
  const webhookPath = `${config.WEBHOOK_URL}/bot${config.TELEGRAM_BOT_TOKEN}`;
  
  bot.setWebHook(webhookPath)
    .then(() => logger.info(`🚀 Telegram Webhook configured to route to: ${webhookPath}`))
    .catch((err) => logger.error(`❌ Telegram Webhook initialization error: ${err.message}`));
} else {
  // Polling mode for local testing
  bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });
  
  bot.deleteWebHook()
    .then(() => logger.info('🚀 Local development polling enabled. Deleted active webhooks.'))
    .catch((err) => logger.error(`❌ Telegram deleteWebHook error: ${err.message}`));
}

// Global Message router
bot.on('message', async (msg) => {
  if (!msg.text || !msg.from) return;

  const telegramId = String(msg.from.id);

  // Anti-spam middleware checks
  if (checkRateLimit(telegramId, bot)) {
    return;
  }

  // Admin routing
  if (msg.text.startsWith('/') && config.ADMIN_IDS.includes(telegramId)) {
    const adminCmds = [
      '/admin',
      '/users',
      '/stats',
      '/broadcast',
      '/broadcast_verified',
      '/broadcast_unverified',
      '/addchannel',
      '/removechannel',
      '/addreward',
      '/removereward',
      '/claims',
      '/pendingclaims'
    ];
    
    const cmd = msg.text.split(/\s+/)[0];
    if (adminCmds.includes(cmd)) {
      return handleAdminCommand(bot, msg);
    }
  }

  // Regular user messages, /start, and reply keyboards
  return handleMessage(bot, msg);
});

// Global Callback router for inline buttons
bot.on('callback_query', async (query) => {
  if (!query.from) return;
  return handleCallbackQuery(bot, query);
});

bot.on('polling_error', (error) => {
  logger.error(`🤖 Telegram Polling error: ${error.message}`);
});

bot.on('webhook_error', (error) => {
  logger.error(`🤖 Telegram Webhook error: ${error.message}`);
});

module.exports = bot;
