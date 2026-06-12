const logger = require('../utils/logger');

// Map to track user message timestamps: telegramId -> timestamp
const userRequests = new Map();
// Map to track rate limit warning timestamps: telegramId -> timestamp
const warningCooldowns = new Map();

const RATE_LIMIT_MS = 1000; // 1 second between requests
const WARNING_COOLDOWN_MS = 5000; // Send warning once every 5 seconds max

/**
 * Check if the user's message should be rate limited.
 * @param {string|number} telegramId - The Telegram User ID.
 * @param {object} bot - The Telegram bot instance (for sending warnings).
 * @returns {boolean} - Returns true if rate limited, false otherwise.
 */
const checkRateLimit = (telegramId, bot) => {
  const userId = String(telegramId);
  const now = Date.now();
  
  if (userRequests.has(userId)) {
    const lastRequest = userRequests.get(userId);
    if (now - lastRequest < RATE_LIMIT_MS) {
      // User is spamming
      userRequests.set(userId, now); // Update to push forward the block window
      
      const lastWarning = warningCooldowns.get(userId) || 0;
      if (now - lastWarning > WARNING_COOLDOWN_MS) {
        warningCooldowns.set(userId, now);
        bot.sendMessage(telegramId, '⚠️ *Slow down!* Please do not spam the bot.', { parse_mode: 'Markdown' })
          .catch((err) => logger.error(`Failed to send rate-limit warning: ${err.message}`));
      }
      return true;
    }
  }

  userRequests.set(userId, now);
  
  // Cleanup map periodically to prevent memory leaks
  if (userRequests.size > 10000) {
    const threshold = now - 60000;
    for (const [key, value] of userRequests.entries()) {
      if (value < threshold) {
        userRequests.delete(key);
        warningCooldowns.delete(key);
      }
    }
  }
  
  return false;
};

module.exports = {
  checkRateLimit,
};
