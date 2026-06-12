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
 * Generates a random math question and returns options for inline buttons.
 * Stores the correct answer.
 * @returns {object} - { questionText, correctAns, keyboard }
 */
const generateCaptcha = () => {
  const num1 = Math.floor(Math.random() * 10) + 1; // 1 to 10
  const num2 = Math.floor(Math.random() * 10) + 1; // 1 to 10
  const correctAns = num1 + num2;

  // Generate 3 unique wrong answers close to correct answer
  const wrongAnswers = new Set();
  while (wrongAnswers.size < 3) {
    const offset = Math.floor(Math.random() * 7) - 3; // -3 to 3
    const wrongAns = correctAns + offset;
    if (wrongAns !== correctAns && wrongAns > 0) {
      wrongAnswers.add(wrongAns);
    }
  }

  // Combine and shuffle options
  const options = [correctAns, ...Array.from(wrongAnswers)];
  options.sort(() => Math.random() - 0.5);

  // Split into rows of 2 buttons
  const inlineKeyboard = [];
  for (let i = 0; i < options.length; i += 2) {
    const row = [];
    row.push({
      text: String(options[i]),
      callback_data: `captcha_ans_${options[i]}`,
    });
    if (options[i + 1] !== undefined) {
      row.push({
        text: String(options[i + 1]),
        callback_data: `captcha_ans_${options[i + 1]}`,
      });
    }
    inlineKeyboard.push(row);
  }

  return {
    questionText: `🧠 *Security Check*\n\nPlease solve the following math puzzle to verify you are human:\n\n*${num1} + ${num2} = ?*`,
    correctAns: String(correctAns),
    keyboard: {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
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
    const hasClaimed = user.claimedRewards.includes(reward._id);
    const isPending = userClaims.some(c => c.rewardId.toString() === reward._id.toString() && c.status === 'pending');
    
    let buttonText = '';
    let callbackData = '';

    if (hasClaimed) {
      buttonText = `✅ ${reward.title} (Claimed)`;
      callbackData = `reward_details_${reward._id}`; // Shows description
    } else if (isPending) {
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
const getAdminKeyboard = () => {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📊 Full Stats', callback_data: 'admin_stats' },
          { text: '👥 View Users', callback_data: 'admin_users' }
        ],
        [
          { text: '⏳ Pending Claims', callback_data: 'admin_pending_claims' },
          { text: '📬 Export CSV', callback_data: 'admin_export_csv' }
        ],
        [
          { text: '⚙️ Bot Settings', callback_data: 'admin_settings' }
        ]
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
  generateCaptcha,
  getWithdrawKeyboard,
  getAdminKeyboard,
  getClaimReviewKeyboard,
};
