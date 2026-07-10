const cacheService = require('./cache.service');
const logger = require('../utils/logger');

/**
 * Checks if a user is in all active required channels.
 * @param {object} bot - The Telegram Bot instance.
 * @param {string|number} userId - The Telegram User ID.
 * @returns {Promise<object>} - Returns { joinedAll: boolean, missingChannels: Array }
 */
const checkChannelMembership = async (bot, userId) => {
  try {
    const activeChannels = await cacheService.getActiveChannels();
    if (activeChannels.length === 0) {
      return { joinedAll: true, missingChannels: [] };
    }

    const missingChannels = [];
    const joinedStatuses = ['member', 'creator', 'administrator', 'restricted'];

    // Check all channels concurrently for better performance
    const checks = await Promise.all(
      activeChannels.map(async (channel) => {
        try {
          const member = await bot.getChatMember(channel.chatId, userId);
          
          if (!joinedStatuses.includes(member.status)) {
            return channel;
          }
          return null; // Joined successfully
        } catch (err) {
          logger.error(`Failed to check membership for channel ${channel.chatId} for user ${userId}: ${err.message}`);
          // If the check fails, fail-safe by marking as missing
          return channel;
        }
      })
    );

    // Add any channels that were returned from the checks (meaning they are missing)
    missingChannels.push(...checks.filter((channel) => channel !== null));

    return {
      joinedAll: missingChannels.length === 0,
      missingChannels,
    };
  } catch (err) {
    logger.error(`Error in checkChannelMembership service: ${err.message}`);
    return { joinedAll: false, missingChannels: [] };
  }
};

module.exports = {
  checkChannelMembership,
};
