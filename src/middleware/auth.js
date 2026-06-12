const config = require('../config');

/**
 * Checks if a given Telegram User ID is in the admin authorization list.
 * @param {string|number} telegramId - The Telegram User ID to verify.
 * @returns {boolean}
 */
const isAdmin = (telegramId) => {
  if (!telegramId) return false;
  return config.ADMIN_IDS.includes(String(telegramId));
};

module.exports = {
  isAdmin,
};
