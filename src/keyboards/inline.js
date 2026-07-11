const Channel = require('../models/channel.model');
const Reward = require('../models/reward.model');
const Claim = require('../models/claim.model');

/**
 * Returns the inline keyboard for joining required channels.
 * @param {Array} channels - List of required channels
 * @returns {object} - Inline keyboard markup
 */
const getForceJoinKeyboard = (channels) => {
  const keyboard = [];

  // Add a button for each channel
  channels.forEach((channel, index) => {
    keyboard.push([
      {
        text: `📢 Join Channel ${index + 1}: ${channel.title}`,
        url: channel.inviteLink,
      },
    ]);
  });

  // Add the verification check button
  keyboard.push([
    {
      text: '✅ I\'ve Joined — Verify',
      callback_data: 'verify_channels',
    },
  ]);

  return {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  };
};



/**
 * Returns inline keyboard for the Withdraw Center.
 * Lists all active rewards and displays their eligibility/claim buttons.
 * @param {object} user - The user document
 * @param {Array} rewards - All active rewards
 * @param {Array} userClaims - User's claims for active rewards (to check pending state)
 * @returns {object} - Inline keyboard markup
 */
const getWithdrawKeyboard = (user, rewards, userClaims) => {
  const keyboard = [];

  rewards.forEach((reward) => {
    const isPending = userClaims.some(c => c.rewardId.toString() === reward._id.toString() && c.status === 'pending');
    
    let buttonText = '';
    let callbackData = '';

    if (isPending) {
      buttonText = `⏳ ${reward.title} (Pending Approval)`;
      callbackData = `reward_details_${reward._id}`;
    } else if (user.referrals >= reward.requiredRefs) {
      buttonText = `🎁 Claim ${reward.title} Now`;
      callbackData = `claim_${reward._id}`;
    } else {
      const needed = reward.requiredRefs - user.referrals;
      buttonText = `🔒 ${reward.title} (Need ${needed} more)`;
      callbackData = `reward_details_${reward._id}`;
    }

    keyboard.push([
      {
        text: buttonText,
        callback_data: callbackData,
      },
    ]);
  });

  return {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  };
};

/**
 * Returns the admin menu inline keyboard options.
 * @returns {object} - Inline keyboard markup
 */
const getAdminKeyboard = (settings) => {
  const deviceVerifyText = settings && settings.deviceVerify === false
    ? '🔴 Device Verify: OFF — tap to enable'
    : '🟢 Device Verify: ON — tap to disable';

  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 Stats', callback_data: 'admin_stats' }],
        [{ text: '🏆 Top 10 Leaderboard', callback_data: 'admin_leaderboard' }],
        [{ text: '🎁 Manage Rewards', callback_data: 'admin_manage_rewards' }],
        [{ text: '📥 Add Stock', callback_data: 'admin_add_stock' }],
        [{ text: '📤 Withdraw Stock', callback_data: 'admin_withdraw_stock' }],
        [{ text: '💰 Add Points to User', callback_data: 'admin_add_points_start' }],
        [{ text: '📺 Manage Channels', callback_data: 'admin_manage_channels' }],
        [{ text: '📢 Broadcast: Verified Only', callback_data: 'admin_broadcast_verified' }],
        [{ text: '📢 Broadcast: All Users', callback_data: 'admin_broadcast_all' }],
        [{ text: '📢 Broadcast: Non-Verified Only', callback_data: 'admin_broadcast_unverified' }],
        [{ text: '⚙️ Settings', callback_data: 'admin_settings' }],
        [{ text: deviceVerifyText, callback_data: 'admin_toggle_device_verify' }]
      ]
    }
  };
};

/**
 * Returns approval/rejection keyboard for a specific claim.
 * @param {string} claimId - The claim ID
 * @returns {object} - Inline keyboard markup
 */
const getClaimReviewKeyboard = (claimId) => {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `admin_claim_approve_${claimId}` },
          { text: '❌ Reject', callback_data: `admin_claim_reject_${claimId}` }
        ]
      ]
    }
  };
};

module.exports = {
  getForceJoinKeyboard,
  getWithdrawKeyboard,
  getAdminKeyboard,
  getClaimReviewKeyboard,
};
