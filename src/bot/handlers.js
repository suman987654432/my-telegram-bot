const User = require('../models/user.model');
const Reward = require('../models/reward.model');
const Claim = require('../models/claim.model');
const Channel = require('../models/channel.model');
const Settings = require('../models/settings.model');
const userService = require('../services/user.service');
const telegramService = require('../services/telegram.service');
const { getMainMenuKeyboard } = require('../keyboards/reply');
const { getForceJoinKeyboard, getWithdrawKeyboard } = require('../keyboards/inline');
const crypto = require('crypto');
const { isAdmin } = require('../middleware/auth');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Main message entry handler.
 */
const handleMessage = async (bot, msg) => {
  const telegramId = String(msg.from.id);
  const text = msg.text ? msg.text.trim() : '';

  try {
    // 1. Get or Create user session
    let user;
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      let referrerTelegramId = null;

      // Extract referral ID: /start ref_123456
      if (parts[1] && parts[1].startsWith('ref_')) {
        referrerTelegramId = parts[1].replace('ref_', '');
      }

      user = await userService.getOrCreateUser(telegramId, {
        username: msg.from.username,
        firstName: msg.from.first_name,
        referrerTelegramId,
      });
    } else {
      user = await User.findOne({ telegramId });
      // If user sends message but doesn't exist, create one
      if (!user) {
        user = await userService.getOrCreateUser(telegramId, {
          username: msg.from.username,
          firstName: msg.from.first_name,
        });
      }
    }

    // 1c. Banned User Interceptor
    if (user.isBanned) {
      return bot.sendMessage(msg.chat.id, '⛔ *You have been banned from using this bot.*', { parse_mode: 'Markdown' });
    }

    // 1b. Admin State Machine Interceptor
    if (isAdmin(telegramId) && user.adminState) {
      const { handleAdminState } = require('./admin');
      return handleAdminState(bot, msg, user);
    }

    // 2. Fetch Settings
    let settings = await Settings.findOne({});
    if (!settings) {
      settings = new Settings({});
      await settings.save();
    }

    // 3. Admin Setting Updates (Check and process)
    if (isAdmin(telegramId)) {
      if (text.startsWith('/setsupport')) {
        const supportUsername = text.replace('/setsupport', '').trim();
        if (!supportUsername) {
          return bot.sendMessage(msg.chat.id, '⚠️ *Usage:* `/setsupport <username>` (e.g. `/setsupport @BestOfferSupport`)', { parse_mode: 'Markdown' });
        }
        settings.supportUsername = supportUsername;
        await settings.save();
        return bot.sendMessage(msg.chat.id, `✅ *Support Username Updated:* ${supportUsername}`, { parse_mode: 'Markdown' });
      }

      if (text === '/togglestatus') {
        settings.botStatus = !settings.botStatus;
        await settings.save();
        return bot.sendMessage(msg.chat.id, `🤖 *Bot Status Updated:* Bot is now *${settings.botStatus ? 'ONLINE' : 'OFFLINE'}*`, { parse_mode: 'Markdown' });
      }
    }

    // 4. Check Bot Status (If offline, stop standard commands except for admins)
    if (!settings.botStatus && !isAdmin(telegramId)) {
      return bot.sendMessage(msg.chat.id, '⚠️ *System Maintenance:* The bot is temporarily offline. Please try again later.', { parse_mode: 'Markdown' });
    }

    // 5. Force Join Check
    const { joinedAll, missingChannels } = await telegramService.checkChannelMembership(bot, telegramId);
    if (!joinedAll) {
      // User must join channels first
      const welcome = `👋 *Welcome to Best Offer Refer Bot*\n\n` +
        `⚠️ *Step 1: Join all required channels*\n\n` +
        `You must join ALL channels below before you can use the bot.`;

      return bot.sendMessage(msg.chat.id, welcome, {
        parse_mode: 'Markdown',
        ...getForceJoinKeyboard(missingChannels),
      });
    }

    // 6. Verification Captcha Check
    if (!user.verified) {
      if (settings.deviceVerify === false) {
        // Automatically verify user
        await userService.verifyUser(bot, telegramId);
        return bot.sendMessage(msg.chat.id, `👋 *Welcome, ${user.firstName}!*\n\n🎉 All channels joined & account verified!\n\nUse the main menu buttons below to navigate the bot.`, getMainMenuKeyboard(isAdmin(telegramId)));
      }

      // Generate or refresh verification link to reset the 10-minute validity window
      user.verificationToken = crypto.randomBytes(16).toString('hex');
      user.verificationTokenCreatedAt = new Date();
      await user.save();

      const domain = config.WEBHOOK_URL ? config.WEBHOOK_URL : `http://127.0.0.1:${config.PORT || 3000}`;
      const verifyLink = `${domain}/verify?id=${user.telegramId}&token=${user.verificationToken}`;

      const verifyMsg = `🔐 *Final Step: Verify your account*\n\n` +
        `This confirms you are a genuine user and prevents abuse.\n\n` +
        `Click the button below to complete the verification:`;

      const isProduction = !!config.WEBHOOK_URL;
      const verifyButton = isProduction
        ? { text: '🔐 Verify Account', web_app: { url: verifyLink } }
        : { text: '🔐 Verify Account (Open in Browser)', url: verifyLink };

      return bot.sendMessage(msg.chat.id, verifyMsg, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[verifyButton]]
        }
      });
    }

    // 7. Route Command based on reply buttons or standard text
    switch (text) {
      case '⚙️ Admin Panel':
        if (isAdmin(telegramId)) {
          const { sendAdminDashboard } = require('./admin');
          return sendAdminDashboard(bot, msg.chat.id);
        }
        break;

      case '🔗 My Referral Link':
        return sendReferralLink(bot, msg.chat.id, user);

      case '📊 My Stats':
        return sendStats(bot, msg.chat.id, user);

      case '👥 My Referrals':
        return sendReferralsList(bot, msg.chat.id, user);

      case '💰 Withdraw':
        return sendWithdrawCenter(bot, msg.chat.id, user);

      case '💬 Support':
        return bot.sendMessage(msg.chat.id, `💬 *Support Center*\n\nFor any questions or issues, please contact our support team:\n\n👉 *${settings.supportUsername}*`, { parse_mode: 'Markdown' });

      default:
        // Default text for start/help
        if (text.startsWith('/start')) {
          return bot.sendMessage(msg.chat.id, `👋 *Welcome back, ${user.firstName}!*\n\n🎉 All channels joined & account verified!\n\nUse the main menu buttons below to navigate the bot.`, getMainMenuKeyboard(isAdmin(telegramId)));
        }

        // Admin instructions if user is admin
        if (isAdmin(telegramId)) {
          return bot.sendMessage(msg.chat.id, `ℹ️ Unknown command. Type \`/admin\` to open the Admin Panel or use the menu below.`, getMainMenuKeyboard(isAdmin(telegramId)));
        }

        return bot.sendMessage(msg.chat.id, `ℹ️ Please use the main menu buttons below to interact with the bot.`, getMainMenuKeyboard(isAdmin(telegramId)));
    }
  } catch (err) {
    logger.error(`Error in handleMessage: ${err.message}`);
    bot.sendMessage(msg.chat.id, '❌ An error occurred while processing your request. Please try again.').catch(() => { });
  }
};

/**
 * Sends unique Referral Link.
 */
const sendReferralLink = (bot, chatId, user) => {
  const refLink = `https://t.me/${config.BOT_USERNAME}?start=ref_${user.telegramId}`;
  const msg = `🔗 *Your Referral Link*\n\n` +
    `👉 \`${refLink}\`\n\n` +
    `📤 *Share this with friends.*\n` +
    `When they join and verify, you earn referrals.`;
  return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
};

/**
 * Sends stats message.
 */
const sendStats = async (bot, chatId, user) => {
  try {
    const claimsCount = await Claim.countDocuments({ userId: user._id, status: 'approved' });
    const joinedDate = new Date(user.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const msg = `📊 *Your Stats*\n\n` +
      `👥 Total referrals: *${user.referrals}*\n` +
      `🎁 Rewards claimed: *${claimsCount}*\n` +
      `📅 Joined Date: *${joinedDate}*`;
    return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error(`Stats logic error: ${err.message}`);
    return bot.sendMessage(chatId, '❌ Error generating statistics.');
  }
};

/**
 * Sends paginated referrals list.
 */
const sendReferralsList = async (bot, chatId, user, page = 1) => {
  try {
    const limit = 5;
    const { referrals, totalCount, totalPages } = await userService.getReferrals(user._id, page, limit);

    let msg = `👥 *Your Referrals*\n\n`;

    if (referrals.length === 0) {
      msg += `🫙 You don't have any verified referrals yet.\nShare your referral link to earn rewards!`;
      return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }

    referrals.forEach((ref, idx) => {
      const num = (page - 1) * limit + idx + 1;
      const username = ref.username ? `@${ref.username}` : 'No username';
      msg += `${num}. *${ref.firstName}* (${username})\n`;
    });

    msg += `\nTotal: *${totalCount}*\n`;
    msg += `Page *${page}* of *${totalPages}*`;

    // Create pagination inline keyboard if page count > 1
    const inlineButtons = [];
    if (page > 1) {
      inlineButtons.push({ text: '⬅️ Prev', callback_data: `page_${page - 1}` });
    }
    if (page < totalPages) {
      inlineButtons.push({ text: 'Next ➡️', callback_data: `page_${page + 1}` });
    }

    const opts = { parse_mode: 'Markdown' };
    if (inlineButtons.length > 0) {
      opts.reply_markup = {
        inline_keyboard: [inlineButtons]
      };
    }

    return bot.sendMessage(chatId, msg, opts);
  } catch (err) {
    logger.error(`Referrals list generation error: ${err.message}`);
    return bot.sendMessage(chatId, '❌ Error fetching referrals.');
  }
};

/**
 * Renders the Withdraw Center.
 */
const sendWithdrawCenter = async (bot, chatId, user) => {
  try {
    const rewards = await Reward.find({ active: true }).sort({ requiredRefs: 1 });
    const userClaims = await Claim.find({ userId: user._id });

    const totalWithdrawn = await Claim.countDocuments({ userId: user._id, status: 'approved' });

    let msg = `💰 *Withdraw Center*\n` +
      `━━━━━━━━━━━━━━\n` +
      `👤 Your referrals: *${user.referrals}*\n` +
      `📦 Total rewards claimed: *${totalWithdrawn}*\n` +
      `━━━━━━━━━━━━━━\n` +
      `Click a milestone below to claim or view details:`;

    return bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      ...getWithdrawKeyboard(user, rewards, userClaims)
    });
  } catch (err) {
    logger.error(`Withdraw center render error: ${err.message}`);
    return bot.sendMessage(chatId, '❌ Error loading Withdraw Center.');
  }
};

/**
 * Handle chat_member updates (Penalty for leaving channel)
 */
const handleChatMember = async (bot, update) => {
  try {
    const { chat, new_chat_member } = update;
    
    if (new_chat_member && (new_chat_member.status === 'left' || new_chat_member.status === 'kicked')) {
      const telegramId = String(new_chat_member.user.id);
      
      const user = await User.findOne({ telegramId }).populate('referredBy');
      if (user) {
        const channel = await Channel.findOne({ chatId: String(chat.id), active: true });
        
        if (channel && user.referredBy) {
          // Deduct 1 point from the referrer because their referral left the channel
          const referrer = await User.findById(user.referredBy._id);
          if (referrer && referrer.referrals > 0) {
            referrer.referrals -= 1;
            await referrer.save();
          }
        }
      }
    }
  } catch (err) {
    logger.error(`Error in handleChatMember: ${err.message}`);
  }
};

module.exports = {
  handleMessage,
  handleChatMember,
  sendReferralsList,
  sendWithdrawCenter,
};
