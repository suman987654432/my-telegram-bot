const User = require('../models/user.model');
const Reward = require('../models/reward.model');
const Claim = require('../models/claim.model');
const Channel = require('../models/channel.model');
const Settings = require('../models/settings.model');
const userService = require('../services/user.service');
const telegramService = require('../services/telegram.service');
const claimService = require('../services/claim.service');
const { getMainMenuKeyboard } = require('../keyboards/reply');
const { getForceJoinKeyboard, getWithdrawKeyboard, getAdminKeyboard } = require('../keyboards/inline');
const crypto = require('crypto');
const config = require('../config');
const admin = require('./admin');
const { isAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * Handle callback queries (inline buttons).
 */
const handleCallbackQuery = async (bot, callbackQuery) => {
  const telegramId = String(callbackQuery.from.id);
  const data = callbackQuery.data;
  const message = callbackQuery.message;
  const queryId = callbackQuery.id;

  try {
    const user = await User.findOne({ telegramId });
    if (!user) {
      return bot.answerCallbackQuery(queryId, { text: '❌ Please start the bot first using /start', show_alert: true });
    }

    // --- FORCE JOIN VERIFICATION ---
    if (data === 'verify_channels') {
      const { joinedAll, missingChannels } = await telegramService.checkChannelMembership(bot, telegramId);

      if (!joinedAll) {
        return bot.answerCallbackQuery(queryId, {
          text: '❌ Please join all channels first!',
          show_alert: true,
        });
      }

      await bot.answerCallbackQuery(queryId, { text: '✅ Channels verified!' });

      if (user.verified) {
        await bot.sendMessage(message.chat.id, '✅ All channels joined!\n\n👋 Welcome back! You can use the menu below to navigate.', getMainMenuKeyboard(isAdmin(telegramId)));
        return bot.deleteMessage(message.chat.id, message.message_id).catch(() => { });
      } else {
        // Fetch settings and check if device verification is enabled
        const settings = await Settings.findOne({});
        if (settings && settings.deviceVerify === false) {
          await userService.verifyUser(bot, telegramId);
          await bot.sendMessage(message.chat.id, '✅ All channels joined & account verified!\n\n👋 Welcome back! You can use the menu below to navigate.', getMainMenuKeyboard(isAdmin(telegramId)));
          return bot.deleteMessage(message.chat.id, message.message_id).catch(() => { });
        }

        // Trigger Web verification
        if (!user.verificationToken) {
          user.verificationToken = crypto.randomBytes(16).toString('hex');
          await user.save();
        }

        const domain = config.WEBHOOK_URL ? config.WEBHOOK_URL : `http://127.0.0.1:${config.PORT || 3000}`;
        const verifyLink = `${domain}/verify?id=${user.telegramId}&token=${user.verificationToken}`;

        const isProduction = !!config.WEBHOOK_URL;
        const verifyButton = isProduction
          ? { text: '🔐 Verify Account', web_app: { url: verifyLink } }
          : { text: '🔐 Verify Account (Open in Browser)', url: verifyLink };

        await bot.editMessageText(`🔐 *Final Step: Verify your account*\n\nThis confirms you are a genuine user and prevents abuse.\n\nClick the button below to complete verification:`, {
          chat_id: message.chat.id,
          message_id: message.message_id,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[verifyButton]]
          }
        });
      }
      return;
    }

    // --- REFERRALS LIST PAGINATION ---
    if (data.startsWith('page_')) {
      const page = parseInt(data.replace('page_', ''), 10);
      const limit = 5;
      const { referrals, totalCount, totalPages } = await userService.getReferrals(user._id, page, limit);

      let msg = `👥 *Your Referrals*\n\n`;
      referrals.forEach((ref, idx) => {
        const num = (page - 1) * limit + idx + 1;
        const username = ref.username ? `@${ref.username}` : 'No username';
        msg += `${num}. *${ref.firstName}* (${username})\n`;
      });

      msg += `\nTotal: *${totalCount}*\n`;
      msg += `Page *${page}* of *${totalPages}*`;

      const inlineButtons = [];
      if (page > 1) {
        inlineButtons.push({ text: '⬅️ Prev', callback_data: `page_${page - 1}` });
      }
      if (page < totalPages) {
        inlineButtons.push({ text: 'Next ➡️', callback_data: `page_${page + 1}` });
      }

      const opts = {
        chat_id: message.chat.id,
        message_id: message.message_id,
        parse_mode: 'Markdown'
      };
      if (inlineButtons.length > 0) {
        opts.reply_markup = {
          inline_keyboard: [inlineButtons]
        };
      }

      await bot.answerCallbackQuery(queryId);
      await bot.editMessageText(msg, opts);
      return;
    }

    // --- REWARD DESCRIPTION POPUP ---
    if (data.startsWith('reward_details_')) {
      const rewardId = data.replace('reward_details_', '');
      const reward = await Reward.findById(rewardId);
      if (!reward) {
        return bot.answerCallbackQuery(queryId, { text: '❌ Reward details not found.', show_alert: true });
      }
      return bot.answerCallbackQuery(queryId, {
        text: `🏆 ${reward.title}\n\nℹ️ ${reward.description}\n\n⚠️ Requires ${reward.requiredRefs} referrals.`,
        show_alert: true,
      });
    }

    // --- SUBMIT CLAIM ---
    if (data.startsWith('claim_')) {
      const rewardId = data.replace('claim_', '');
      const reward = await Reward.findById(rewardId);

      if (!reward) {
        return bot.answerCallbackQuery(queryId, { text: '❌ Reward milestone not found.', show_alert: true });
      }

      try {
        await claimService.createClaimRequest(user, reward);
        await bot.answerCallbackQuery(queryId, { text: '🎉 Claim requested! Pending admin approval.', show_alert: true });

        // Refresh Withdraw Center UI
        const rewards = await Reward.find({ active: true }).sort({ requiredRefs: 1 });
        const userClaims = await Claim.find({ userId: user._id });
        const totalWithdrawn = await Claim.countDocuments({ userId: user._id, status: 'approved' });

        const msg = `💰 *Withdraw Center*\n` +
          `━━━━━━━━━━━━━━\n\n` +
          `👤 Your referrals: *${user.referrals}*\n` +
          `📦 Total rewards claimed: *${totalWithdrawn}*\n\n` +
          `━━━━━━━━━━━━━━\n\n` +
          `Click a milestone below to claim or view details:`;

        await bot.editMessageText(msg, {
          chat_id: message.chat.id,
          message_id: message.message_id,
          parse_mode: 'Markdown',
          ...getWithdrawKeyboard(user, rewards, userClaims)
        });

        // Notify admins about new claim
        config.ADMIN_IDS.forEach((adminId) => {
          bot.sendMessage(adminId, `🔔 *New Claim Request!*\n\n` +
            `👤 User: *${user.firstName}* (${user.username ? '@' + user.username : 'No username'})\n` +
            `🎁 Reward: *${reward.title}*\n` +
            `Type \`/pendingclaims\` to review requests.`, { parse_mode: 'Markdown' })
            .catch(() => { });
        });

      } catch (err) {
        return bot.answerCallbackQuery(queryId, { text: `❌ Claim failed: ${err.message}`, show_alert: true });
      }
      return;
    }

    // --- ADMIN PANEL ACTION ROUTER ---
    if (data.startsWith('admin_')) {
      if (!isAdmin(telegramId)) {
        return bot.answerCallbackQuery(queryId, { text: '❌ Unauthorized.', show_alert: true });
      }

      await bot.answerCallbackQuery(queryId);

      // Approve claim
      if (data.startsWith('admin_claim_approve_')) {
        const claimId = data.replace('admin_claim_approve_', '');
        try {
          const claim = await claimService.resolveClaim(bot, claimId, 'approved');
          const username = claim.userId ? (claim.userId.username ? `@${claim.userId.username}` : claim.userId.firstName) : 'Unknown';
          const rewardTitle = claim.rewardId ? claim.rewardId.title : 'Deleted Reward';

          await bot.editMessageText(`${message.text}\n\n✅ *Approved* by admin.`, {
            chat_id: message.chat.id,
            message_id: message.message_id,
            parse_mode: 'Markdown'
          });
        } catch (err) {
          await bot.sendMessage(message.chat.id, `❌ Failed to approve claim: ${err.message}`);
        }
        return;
      }

      // Reject claim
      if (data.startsWith('admin_claim_reject_')) {
        const claimId = data.replace('admin_claim_reject_', '');
        try {
          const claim = await claimService.resolveClaim(bot, claimId, 'rejected');
          await bot.editMessageText(`${message.text}\n\n❌ *Rejected* by admin.`, {
            chat_id: message.chat.id,
            message_id: message.message_id,
            parse_mode: 'Markdown'
          });
        } catch (err) {
          await bot.sendMessage(message.chat.id, `❌ Failed to reject claim: ${err.message}`);
        }
        return;
      }

      // Sub-menu redirections
      switch (data) {
        case 'admin_toggle_device_verify':
          try {
            let settings = await Settings.findOne({});
            if (!settings) {
              settings = new Settings({});
            }
            settings.deviceVerify = !settings.deviceVerify;
            await settings.save();

            // Refresh the admin dashboard inline keyboard
            const totalUsers = await User.countDocuments({});
            const verifiedUsers = await User.countDocuments({ verified: true });
            const totalReferrals = await User.aggregate([
              { $group: { _id: null, total: { $sum: '$referrals' } } }
            ]);
            const totalClaims = await Claim.countDocuments({});
            const referralCount = totalReferrals[0] ? totalReferrals[0].total : 0;

            const response = `👑 *Best Offer Refer Bot — Admin Dashboard*\n\n` +
                             `👥 Total Users: *${totalUsers}*\n` +
                             `✅ Verified Users: *${verifiedUsers}*\n` +
                             `📈 Total Referrals: *${referralCount}*\n` +
                             `🎁 Total Claims: *${totalClaims}*\n\n` +
                             `Use buttons below to navigate or run text commands like:\n` +
                             `• \`/broadcast [message]\`\n` +
                             `• \`/addchannel [chatId] [Title] [inviteLink]\`\n` +
                             `• \`/addreward [refs] [Title] - [Description]\`\n` +
                             `• \`/pendingclaims\``;

            await bot.editMessageText(response, {
              chat_id: message.chat.id,
              message_id: message.message_id,
              parse_mode: 'Markdown',
              ...getAdminKeyboard(settings)
            });
          } catch (err) {
            logger.error(`Error toggling device verify: ${err.message}`);
          }
          return;

        case 'admin_stats':
          return admin.sendDetailedStats(bot, message.chat.id);
        case 'admin_users':
          const totalUsers = await User.countDocuments({});
          const verifiedUsers = await User.countDocuments({ verified: true });
          return bot.sendMessage(message.chat.id, `👥 *Users List Summary*\n\nTotal Users: *${totalUsers}*\nVerified: *${verifiedUsers}*`, { parse_mode: 'Markdown' });
        case 'admin_pending_claims':
          return admin.sendPendingClaims(bot, message.chat.id);
        case 'admin_export_csv':
          return admin.handleExportCSV(bot, message.chat.id);
        case 'admin_settings':
          return admin.sendSettingsDashboard(bot, message.chat.id);
      }
      return;
    }

  } catch (err) {
    logger.error(`Callback handler error: ${err.message}`);
    bot.answerCallbackQuery(queryId, { text: '❌ Error processing interactive button action.' }).catch(() => { });
  }
};

module.exports = {
  handleCallbackQuery,
};
