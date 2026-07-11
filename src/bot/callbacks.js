const User = require('../models/user.model');
const Reward = require('../models/reward.model');
const Claim = require('../models/claim.model');
const Settings = require('../models/settings.model');
const cacheService = require('../services/cache.service');
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

        // Trigger Web verification (always refresh token/timestamp to reset the 10-minute validity window)
        user.verificationToken = crypto.randomBytes(16).toString('hex');
        user.verificationTokenCreatedAt = new Date();
        await user.save();

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
        const { claim, givenCode } = await claimService.createClaimRequest(user, reward);
        await bot.answerCallbackQuery(queryId, { text: '🎉 Claim approved instantly!', show_alert: true });

        // Send instant approval message to user chat
        let approvalMsg = `🎉 *Claim Approved!*\n\n` +
                          `🎁 Your withdrawal request for *${reward.title}* has been processed instantly!\n`;
                          
        if (givenCode) {
          approvalMsg += `\n🔑 *Your Unique Code:* \`${givenCode}\`\n\n`;
        }
        
        approvalMsg += `ℹ️ Description: _${reward.description}_`;
        bot.sendMessage(message.chat.id, approvalMsg, { parse_mode: 'Markdown' }).catch(()=>{});

        // Refresh Withdraw Center UI
        const rewards = await Reward.find({ active: true }).sort({ requiredRefs: 1 });
        const userClaims = await Claim.find({ userId: user._id });
        const totalWithdrawn = await Claim.countDocuments({ userId: user._id, status: 'approved' });

        const msg = `💰 *Withdraw Center*\n` +
          `━━━━━━━━━━━━━━\n` +
          `👤 Your referrals: *${user.referrals}*\n` +
          `📦 Total rewards claimed: *${totalWithdrawn}*\n` +
          `━━━━━━━━━━━━━━\n` +
          `Click a milestone below to claim or view details:`;

        await bot.editMessageText(msg, {
          chat_id: message.chat.id,
          message_id: message.message_id,
          parse_mode: 'Markdown',
          ...getWithdrawKeyboard(user, rewards, userClaims)
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

      // Delete reward milestone
      if (data.startsWith('admin_del_rew_')) {
        const rewardId = data.replace('admin_del_rew_', '');
        const Reward = require('../models/reward.model');
        await Reward.deleteOne({ _id: rewardId });
        return admin.sendRewardsManagement(bot, message.chat.id, message.message_id);
      }

      // Delete required channel
      if (data.startsWith('admin_del_chan_')) {
        const channelId = data.replace('admin_del_chan_', '');
        const Channel = require('../models/channel.model');
        await Channel.deleteOne({ _id: channelId });
        cacheService.invalidateCache();
        return admin.sendChannelsManagement(bot, message.chat.id, message.message_id);
      }

      // Start Add Reward Wizard
      if (data === 'admin_add_rew_start') {
        user.adminState = 'awaiting_reward_refs';
        user.adminTempData = {};
        await user.save();
        return bot.sendMessage(message.chat.id, '✍️ *Step 1 of 3: Enter Milestone Referral Count*\n\nProvide the number of referrals needed to unlock this reward (e.g. `15`):', { parse_mode: 'Markdown' });
      }

      // Start Add Channel Wizard
      if (data === 'admin_add_chan_start') {
        user.adminState = 'awaiting_channel_id';
        user.adminTempData = {};
        await user.save();
        return bot.sendMessage(message.chat.id, '✍️ *Step 1 of 3: Enter Channel Chat ID*\n\nProvide the public username or ID of the channel (e.g., `@mychannel`):', { parse_mode: 'Markdown' });
      }

      // Start Add Codes Wizard (formerly Add Stock Wizard)
      if (data.startsWith('admin_add_codes_to_')) {
        const rewardId = data.replace('admin_add_codes_to_', '');
        user.adminState = 'awaiting_reward_code';
        user.adminTempData = { rewardId };
        await user.save();
        return bot.sendMessage(message.chat.id, '✍️ *Add Codes to Reward*\n\nEnter the code(s) you want to add to this reward.\nTo add multiple codes at once, separate them with a comma (e.g., `CODE1, CODE2, CODE3`):', { parse_mode: 'Markdown' });
      }

      // Start Withdraw Codes Wizard
      if (data.startsWith('admin_withdraw_codes_from_')) {
        const rewardId = data.replace('admin_withdraw_codes_from_', '');
        user.adminState = 'awaiting_withdraw_codes_amount';
        user.adminTempData = { rewardId };
        await user.save();
        return bot.sendMessage(message.chat.id, '📤 *Withdraw Codes*\n\nHow many codes do you want to withdraw from this reward?\nPlease enter a valid number (e.g., `5`):', { parse_mode: 'Markdown' });
      }


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
            cacheService.invalidateCache();

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
          return admin.sendDetailedStats(bot, message.chat.id, message.message_id);
        case 'admin_pending_claims':
          return admin.sendPendingClaims(bot, message.chat.id);
        case 'admin_export_csv':
          return admin.handleExportCSV(bot, message.chat.id);
        case 'admin_settings':
          return admin.sendSettingsDashboard(bot, message.chat.id, message.message_id);
        case 'admin_back_to_dashboard':
          try {
            let settings = await Settings.findOne({});
            if (!settings) {
              settings = new Settings({});
              await settings.save();
            }
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
            logger.error(`Error going back to dashboard: ${err.message}`);
          }
          return;
        case 'admin_manage_rewards':
          return admin.sendRewardsManagement(bot, message.chat.id, message.message_id);
        case 'admin_manage_channels':
          return admin.sendChannelsManagement(bot, message.chat.id, message.message_id);
        case 'admin_add_stock':
          try {
            const rewards = await Reward.find({ active: true });
            let text = `📥 *Stock Management*\n\nSelect a reward to add codes to it:`;
            let inline_keyboard = [];
            
            if (rewards.length > 0) {
              rewards.forEach(r => {
                inline_keyboard.push([{ 
                  text: `📦 ${r.title} (Stock: ${r.codes.length})`, 
                  callback_data: `admin_add_codes_to_${r._id}` 
                }]);
              });
            } else {
              text += `\n\n🫙 No rewards found. Create a reward first from "Manage Rewards".`;
            }
            
            inline_keyboard.push([{ text: '🔙 Back to Dashboard', callback_data: 'admin_back_to_dashboard' }]);

            await bot.editMessageText(text, {
              chat_id: message.chat.id,
              message_id: message.message_id,
              parse_mode: 'Markdown',
              reply_markup: { inline_keyboard }
            });
          } catch (err) {
            logger.error(`Stock management error: ${err.message}`);
          }
          return;
        case 'admin_withdraw_stock':
          try {
            const rewards = await Reward.find({ active: true });
            let text = `📤 *Withdraw Stock Management*\n\nSelect a reward to withdraw codes from it:`;
            let inline_keyboard = [];
            
            if (rewards.length > 0) {
              rewards.forEach(r => {
                inline_keyboard.push([{ 
                  text: `📤 ${r.title} (Stock: ${r.codes.length})`, 
                  callback_data: `admin_withdraw_codes_from_${r._id}` 
                }]);
              });
            } else {
              text += `\n\n🫙 No rewards found. Create a reward first from "Manage Rewards".`;
            }
            
            inline_keyboard.push([{ text: '🔙 Back to Dashboard', callback_data: 'admin_back_to_dashboard' }]);

            await bot.editMessageText(text, {
              chat_id: message.chat.id,
              message_id: message.message_id,
              parse_mode: 'Markdown',
              reply_markup: { inline_keyboard }
            });
          } catch (err) {
            logger.error(`Withdraw stock management error: ${err.message}`);
          }
          return;
        case 'admin_broadcast_verified':
          await bot.editMessageText(
            `📢 *Broadcast: Verified Users Only*\n\n` +
            `To send a message to verified accounts only, send the command:\n` +
            `\`/broadcast_verified [Your message content]\``,
            {
              chat_id: message.chat.id,
              message_id: message.message_id,
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_back_to_dashboard' }]]
              }
            }
          );
          return;
        case 'admin_broadcast_all':
          await bot.editMessageText(
            `📢 *Broadcast: All Registered Users*\n\n` +
            `To send a message to all users, send the command:\n` +
            `\`/broadcast [Your message content]\``,
            {
              chat_id: message.chat.id,
              message_id: message.message_id,
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_back_to_dashboard' }]]
              }
            }
          );
          return;
        case 'admin_broadcast_unverified':
          await bot.editMessageText(
            `📢 *Broadcast: Non-Verified Users Only*\n\n` +
            `To send a message to unverified/pending accounts only, send the command:\n` +
            `\`/broadcast_unverified [Your message content]\``,
            {
              chat_id: message.chat.id,
              message_id: message.message_id,
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back to Dashboard', callback_data: 'admin_back_to_dashboard' }]]
              }
            }
          );
          return;
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
