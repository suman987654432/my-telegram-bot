const Claim = require('../models/claim.model');
const User = require('../models/user.model');
const Reward = require('../models/reward.model');
const logger = require('../utils/logger');

/**
 * Checks if a user is eligible to claim a specific reward.
 * @param {object} user - User document.
 * @param {object} reward - Reward document.
 * @returns {Promise<object>} - { eligible: boolean, reason: string }
 */
const checkEligibility = async (user, reward) => {
  if (user.referrals < reward.requiredRefs) {
    return { eligible: false, reason: `Requires ${reward.requiredRefs} referrals. You have ${user.referrals}.` };
  }

  // Check if reward is already claimed (approved)
  if (user.claimedRewards.includes(reward._id)) {
    return { eligible: false, reason: 'You have already claimed this reward.' };
  }

  // Check if there is a pending claim request
  const pendingClaim = await Claim.findOne({
    userId: user._id,
    rewardId: reward._id,
    status: 'pending',
  });

  if (pendingClaim) {
    return { eligible: false, reason: 'You have a pending claim request for this reward.' };
  }

  return { eligible: true, reason: 'Eligible to claim!' };
};

/**
 * Creates a claim request for a reward.
 * @param {object} user - User document.
 * @param {object} reward - Reward document.
 * @returns {Promise<object>} - The created claim document.
 */
const createClaimRequest = async (user, reward) => {
  try {
    const { eligible, reason } = await checkEligibility(user, reward);
    if (!eligible) {
      throw new Error(reason);
    }

    const claim = new Claim({
      userId: user._id,
      rewardId: reward._id,
      status: 'pending',
    });

    await claim.save();
    logger.info(`💰 Claim request created for user ${user.telegramId}, reward: ${reward.title}`);
    return claim;
  } catch (err) {
    logger.error(`Error creating claim request: ${err.message}`);
    throw err;
  }
};

/**
 * Approves or rejects a pending claim request.
 * @param {object} bot - Telegram bot instance to send notifications.
 * @param {string} claimId - ObjectId string of the claim.
 * @param {string} status - 'approved' or 'rejected'.
 * @returns {Promise<object>} - Updated claim document.
 */
const resolveClaim = async (bot, claimId, status) => {
  try {
    if (!['approved', 'rejected'].includes(status)) {
      throw new Error("Invalid resolution status. Must be 'approved' or 'rejected'.");
    }

    const claim = await Claim.findById(claimId).populate('userId').populate('rewardId');
    if (!claim) {
      throw new Error('Claim request not found.');
    }

    if (claim.status !== 'pending') {
      throw new Error(`Claim is already processed with status: ${claim.status}`);
    }

    claim.status = status;
    claim.resolvedAt = Date.now();
    await claim.save();

    const user = claim.userId;
    const reward = claim.rewardId;

    if (status === 'approved') {
      // Add reward to user's claimed list
      if (!user.claimedRewards.includes(reward._id)) {
        user.claimedRewards.push(reward._id);
        await user.save();
      }

      logger.info(`✅ Claim ${claimId} approved for user ${user.telegramId}`);

      // Send Telegram notification
      const msg = `🎉 *Claim Approved!*\n\n` +
                  `🎁 Your withdrawal request for *${reward.title}* has been approved by the admin!\n` +
                  `ℹ️ Description: _${reward.description}_`;
      bot.sendMessage(user.telegramId, msg, { parse_mode: 'Markdown' })
        .catch(err => logger.error(`Failed to send claim approval notification: ${err.message}`));
    } else {
      logger.info(`❌ Claim ${claimId} rejected for user ${user.telegramId}`);

      // Send Telegram notification
      const msg = `❌ *Claim Rejected*\n\n` +
                  `🎁 Your withdrawal request for *${reward.title}* was rejected by the admin.\n` +
                  `💬 Please contact support if you believe this is a mistake.`;
      bot.sendMessage(user.telegramId, msg, { parse_mode: 'Markdown' })
        .catch(err => logger.error(`Failed to send claim rejection notification: ${err.message}`));
    }

    return claim;
  } catch (err) {
    logger.error(`Error resolving claim: ${err.message}`);
    throw err;
  }
};

module.exports = {
  checkEligibility,
  createClaimRequest,
  resolveClaim,
};
