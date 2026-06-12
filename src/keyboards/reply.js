/**
 * Returns the main menu reply keyboard markup.
 * @returns {object} - Reply keyboard markup
 */
const getMainMenuKeyboard = () => {
  return {
    reply_markup: {
      keyboard: [
        [
          { text: '🔗 My Referral Link' },
          { text: '📊 My Stats' }
        ],
        [
          { text: '💰 Withdraw' },
          { text: '👥 My Referrals' }
        ],
        [
          { text: '💬 Support' }
        ]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
};

module.exports = {
  getMainMenuKeyboard,
};
