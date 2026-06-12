/**
 * Returns the main menu reply keyboard markup.
 * @param {boolean} isAdminUser - Whether the user is an admin
 * @returns {object} - Reply keyboard markup
 */
const getMainMenuKeyboard = (isAdminUser = false) => {
  const keyboard = [
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
  ];

  if (isAdminUser) {
    keyboard.push([{ text: '⚙️ Admin Panel' }]);
  }

  return {
    reply_markup: {
      keyboard,
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
};

module.exports = {
  getMainMenuKeyboard,
};
