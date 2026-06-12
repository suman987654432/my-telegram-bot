const Channel = require('../models/channel.model');
const logger = require('../utils/logger');

/**
 * Checks if a user is in all active required channels.
 * @param {object} bot - The Telegram Bot instance.
 * @param {string|number} userId - The Telegram User ID.
 * @returns {Promise<object>} - Returns { joinedAll: boolean, missingChannels: Array }
 */
const checkChannelMembership = async (bot, userId) => {
  try {
    const activeChannels = await Channel.find({ active: true });
    if (activeChannels.length === 0) {
      return { joinedAll: true, missingChannels: [] };
    }

    const missingChannels = [];

    for (const channel of activeChannels) {
      try {
        const member = await bot.getChatMember(channel.chatId, userId);
        
        // Allowed membership roles in Telegram
        const joinedStatuses = ['member', 'creator', 'administrator', 'restricted'];
        
        if (!joinedStatuses.includes(member.status)) {
          missingChannels.push(channel);
        }
      } catch (err) {
        logger.error(`Failed to check membership for channel ${channel.chatId} for user ${userId}: ${err.message}`);
        // If the check fails (e.g., bot kicked, incorrect channel configuration), fail-safe by marking as missing
        missingChannels.push(channel);
      }
    }

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
