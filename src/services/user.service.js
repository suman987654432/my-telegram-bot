const User = require('../models/user.model');
const logger = require('../utils/logger');

/**
 * Gets an existing user or creates a new one.
 * Sets referredBy if the user is new and joined via a valid, non-self referral link.
 * @param {string} telegramId - Telegram ID of the user.
 * @param {object} details - { username, firstName, referrerTelegramId }
 * @returns {Promise<object>} - The user document.
 */
const getOrCreateUser = async (telegramId, { username, firstName, referrerTelegramId } = {}) => {
  try {
    let user = await User.findOne({ telegramId });

    if (!user) {
      let referredByObjectId = null;

      // Handle referral code if present and not self-referral
      if (referrerTelegramId && String(referrerTelegramId) !== String(telegramId)) {
        const referrer = await User.findOne({ telegramId: String(referrerTelegramId) });
        if (referrer) {
          referredByObjectId = referrer._id;
          logger.info(`User ${telegramId} referred by ${referrerTelegramId} (${referrer._id})`);
        }
      }

      user = new User({
        telegramId,
        username,
        firstName,
        referredBy: referredByObjectId,
      });
      await user.save();
      logger.info(`👤 New user registered: ${firstName} (${telegramId})`);
    } else {
      // Update username or first name if changed
      let changed = false;
      if (user.username !== username) {
        user.username = username;
        changed = true;
      }
      if (user.firstName !== firstName) {
        user.firstName = firstName;
        changed = true;
      }
      if (changed) {
        await user.save();
      }
    }

    return user;
  } catch (err) {
    logger.error(`Error in getOrCreateUser service: ${err.message}`);
    throw err;
  }
};

/**
 * Marks a user as verified and awards referral credit to their referrer.
 * @param {object} bot - Telegram Bot instance to send credit notifications.
 * @param {string} telegramId - Telegram ID of the user to verify.
 * @returns {Promise<object>} - Updated user document.
 */
const verifyUser = async (bot, telegramId) => {
  try {
    const user = await User.findOne({ telegramId }).populate('referredBy');
    if (!user) {
      throw new Error('User not found');
    }

    // If already verified, do nothing to prevent duplicate counts
    if (user.verified) {
      return user;
    }

    user.verified = true;
    user.verifiedAt = Date.now();
    await user.save();

    logger.info(`✅ User ${telegramId} completed verification`);

    // If referred by someone, credit the referrer
    if (user.referredBy) {
      const referrer = await User.findById(user.referredBy._id);
      if (referrer) {
        referrer.referrals += 1;
        
        // Anti-farming check: Limit to max 3 verified referrals per 2 minutes
        const recentReferralsCount = await User.countDocuments({
          referredBy: referrer._id,
          verified: true,
          verifiedAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) }
        });
        
        if (recentReferralsCount >= 3) {
          referrer.suspicious = true;
          referrer.isBanned = true;
          referrer.flaggedReason = `Speed limit exceeded: ${recentReferralsCount} referrals verified within 2 minutes. Auto-Banned.`;
          logger.warn(`🚨 Referrer ${referrer.telegramId} marked suspicious and AUTO-BANNED. Verified ${recentReferralsCount} users in 2 minutes.`);
          bot.sendMessage(referrer.telegramId, '⛔ *Your account has been automatically banned for suspicious referral farming activity.*', { parse_mode: 'Markdown' }).catch(()=>{});
        }

        await referrer.save();

        logger.info(`🎉 Referrer ${referrer.telegramId} credited for referral of ${telegramId}`);

        // Notify referrer
        const refName = user.firstName;
        const refUser = user.username ? `@${user.username}` : 'Anonymous';
        let msg = `🎉 *New Referral Verified!*\n\n` +
                  `👤 *${refName}* (${refUser}) has completed verification.\n` +
                  `➕ You earned *1* referral!\n` +
                  `👥 Your total referrals: *${referrer.referrals}*`;
                  
        if (referrer.suspicious) {
          msg += `\n\n⚠️ *System Note:* Your account activity has triggered our security system for verification frequency. Your referral earnings are subject to review during withdrawal.`;
        }

        bot.sendMessage(referrer.telegramId, msg, { parse_mode: 'Markdown' })
          .catch((err) => logger.error(`Failed to notify referrer ${referrer.telegramId}: ${err.message}`));
      }
    }

    return user;
  } catch (err) {
    logger.error(`Error in verifyUser service: ${err.message}`);
    throw err;
  }
};

/**
 * Retrieves paginated list of verified referrals for a user.
 * @param {string} userObjectId - Mongoose ObjectId of the user.
 * @param {number} page - Page number (1-indexed).
 * @param {number} limit - Items per page.
 * @returns {Promise<object>} - { referrals, totalCount, totalPages }
 */
const getReferrals = async (userObjectId, page = 1, limit = 5) => {
  try {
    const skip = (page - 1) * limit;
    const query = { referredBy: userObjectId, verified: true };

    const totalCount = await User.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const referrals = await User.find(query)
      .sort({ verifiedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return {
      referrals,
      totalCount,
      totalPages,
    };
  } catch (err) {
    logger.error(`Error in getReferrals service: ${err.message}`);
    throw err;
  }
};

module.exports = {
  getOrCreateUser,
  verifyUser,
  getReferrals,
};
