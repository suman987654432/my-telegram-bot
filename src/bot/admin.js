const fs = require('fs');
const path = require('path');
const User = require('../models/user.model');
const Reward = require('../models/reward.model');
const Claim = require('../models/claim.model');
const Channel = require('../models/channel.model');
const Settings = require('../models/settings.model');
const claimService = require('../services/claim.service');
const { isAdmin } = require('../middleware/auth');
const { exportUsersToCSV } = require('../utils/csv');
const { getAdminKeyboard, getClaimReviewKeyboard } = require('../keyboards/inline');
const logger = require('../utils/logger');

/**
 * Handle admin panel entry and text commands.
 */
const handleAdminCommand = async (bot, msg) => {
  const telegramId = String(msg.from.id);
  
  if (!isAdmin(telegramId)) {
    return bot.sendMessage(msg.chat.id, '❌ *Unauthorized:* You are not an administrator of this bot.', { parse_mode: 'Markdown' });
  }

  const text = msg.text.trim();

  // /admin dashboard
  if (text === '/admin') {
    return sendAdminDashboard(bot, msg.chat.id);
  }

  // /users command
  if (text === '/users') {
    try {
      const totalUsers = await User.countDocuments({});
      const verifiedUsers = await User.countDocuments({ verified: true });
      const unverifiedUsers = totalUsers - verifiedUsers;

      const response = `👥 *User Database Statistics*\n\n` +
                       `👤 Total Users: *${totalUsers}*\n` +
                       `✅ Verified Users: *${verifiedUsers}*\n` +
                       `⏳ Unverified Users: *${unverifiedUsers}*`;
      return bot.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error(`Admin users command error: ${err.message}`);
      return bot.sendMessage(msg.chat.id, '❌ Failed to fetch user counts.');
    }
  }

  // /stats command
  if (text === '/stats') {
    return sendDetailedStats(bot, msg.chat.id);
  }

  // /broadcast command
  if (text.startsWith('/broadcast')) {
    const broadcastText = text.replace('/broadcast', '').trim();
    if (!broadcastText) {
      return bot.sendMessage(msg.chat.id, '⚠️ *Usage:* `/broadcast [Your message here]`', { parse_mode: 'Markdown' });
    }
    
    bot.sendMessage(msg.chat.id, '📣 *Broadcast started.* Sending messages to all users...');
    
    // Run broadcast in background
    runBroadcast(bot, msg.chat.id, broadcastText);
    return;
  }

  // /addchannel command: /addchannel <chatId> <title> <inviteLink>
  if (text.startsWith('/addchannel')) {
    const parts = text.split(/\s+/);
    if (parts.length < 4) {
      return bot.sendMessage(msg.chat.id, '⚠️ *Usage:* `/addchannel <chatId> <title> <inviteLink>`\n\nExample:\n`/addchannel @mychannel "My Channel" https://t.me/mychannel`', { parse_mode: 'Markdown' });
    }

    const chatId = parts[1];
    const inviteLink = parts[parts.length - 1];
    
    // Join the middle parts for the title
    let title = parts.slice(2, parts.length - 1).join(' ');
    // Remove wrapping quotes if present
    if (title.startsWith('"') && title.endsWith('"')) {
      title = title.substring(1, title.length - 1);
    }

    try {
      let channel = await Channel.findOne({ chatId });
      if (channel) {
        channel.title = title;
        channel.inviteLink = inviteLink;
        channel.active = true;
      } else {
        channel = new Channel({ chatId, title, inviteLink });
      }
      await channel.save();
      return bot.sendMessage(msg.chat.id, `✅ *Channel Added:* ${title} (${chatId}) is now required for force join.`, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error(`Add channel error: ${err.message}`);
      return bot.sendMessage(msg.chat.id, `❌ *Error adding channel:* ${err.message}`, { parse_mode: 'Markdown' });
    }
  }

  // /removechannel command: /removechannel <chatId>
  if (text.startsWith('/removechannel')) {
    const parts = text.split(/\s+/);
    const chatId = parts[1];
    if (!chatId) {
      return bot.sendMessage(msg.chat.id, '⚠️ *Usage:* `/removechannel <chatId>`', { parse_mode: 'Markdown' });
    }

    try {
      const result = await Channel.deleteOne({ chatId });
      if (result.deletedCount > 0) {
        return bot.sendMessage(msg.chat.id, `✅ *Channel Removed:* ${chatId} has been deleted from required channels.`, { parse_mode: 'Markdown' });
      } else {
        return bot.sendMessage(msg.chat.id, `❌ *Not Found:* No channel with chatId ${chatId} was found.`, { parse_mode: 'Markdown' });
      }
    } catch (err) {
      logger.error(`Remove channel error: ${err.message}`);
      return bot.sendMessage(msg.chat.id, `❌ *Error removing channel:* ${err.message}`, { parse_mode: 'Markdown' });
    }
  }

  // /addreward command: /addreward <requiredRefs> <title> - <description>
  if (text.startsWith('/addreward')) {
    const match = text.match(/^\/addreward\s+(\d+)\s+(.+?)\s+-\s+(.+)$/);
    if (!match) {
      return bot.sendMessage(msg.chat.id, '⚠️ *Usage:* `/addreward <requiredRefs> <title> - <description>`\n\nExample:\n`/addreward 15 Reward Level 1 - Cash reward of $10`', { parse_mode: 'Markdown' });
    }

    const requiredRefs = parseInt(match[1], 10);
    const title = match[2].trim();
    const description = match[3].trim();

    try {
      let reward = await Reward.findOne({ requiredRefs });
      if (reward) {
        reward.title = title;
        reward.description = description;
        reward.active = true;
      } else {
        reward = new Reward({ title, description, requiredRefs });
      }
      await reward.save();
      return bot.sendMessage(msg.chat.id, `✅ *Reward Added:* "${title}" unlocked at *${requiredRefs}* referrals.`, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error(`Add reward error: ${err.message}`);
      return bot.sendMessage(msg.chat.id, `❌ *Error adding reward:* ${err.message}`, { parse_mode: 'Markdown' });
    }
  }

  // /removereward command: /removereward <id> or <requiredRefs>
  if (text.startsWith('/removereward')) {
    const parts = text.split(/\s+/);
    const identifier = parts[1];
    if (!identifier) {
      return bot.sendMessage(msg.chat.id, '⚠️ *Usage:* `/removereward <requiredRefs>` (e.g. `/removereward 15`)', { parse_mode: 'Markdown' });
    }

    try {
      const numRefs = parseInt(identifier, 10);
      let result;
      if (!isNaN(numRefs)) {
        result = await Reward.deleteOne({ requiredRefs: numRefs });
      } else {
        result = await Reward.deleteOne({ _id: identifier });
      }

      if (result.deletedCount > 0) {
        return bot.sendMessage(msg.chat.id, `✅ *Reward Milestone Deleted.*`, { parse_mode: 'Markdown' });
      } else {
        return bot.sendMessage(msg.chat.id, `❌ *Not Found:* Milestone identifier not found.`, { parse_mode: 'Markdown' });
      }
    } catch (err) {
      logger.error(`Remove reward error: ${err.message}`);
      return bot.sendMessage(msg.chat.id, `❌ *Error removing reward:* ${err.message}`, { parse_mode: 'Markdown' });
    }
  }

  // /claims command
  if (text === '/claims') {
    try {
      const claims = await Claim.find({}).sort({ claimedAt: -1 }).limit(10).populate('userId').populate('rewardId');
      if (claims.length === 0) {
        return bot.sendMessage(msg.chat.id, '🫙 No claims found in the database.');
      }

      let response = `📊 *Recent Claims (Last 10)*\n\n`;
      claims.forEach((claim, idx) => {
        const username = claim.userId ? (claim.userId.username ? `@${claim.userId.username}` : claim.userId.firstName) : 'Unknown';
        const title = claim.rewardId ? claim.rewardId.title : 'Deleted Reward';
        const statusEmoji = claim.status === 'approved' ? '✅' : (claim.status === 'rejected' ? '❌' : '⏳');
        response += `${idx + 1}. User: ${username} | Reward: *${title}* | Status: ${statusEmoji} *${claim.status}*\n`;
      });
      return bot.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error(`Claims list error: ${err.message}`);
      return bot.sendMessage(msg.chat.id, '❌ Failed to fetch claims.');
    }
  }

  // /pendingclaims command
  if (text === '/pendingclaims') {
    return sendPendingClaims(bot, msg.chat.id);
  }
};

/**
 * Sends Admin Dashboard
 */
const sendAdminDashboard = async (bot, chatId) => {
  try {
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

    return bot.sendMessage(chatId, response, {
      parse_mode: 'Markdown',
      ...getAdminKeyboard()
    });
  } catch (err) {
    logger.error(`Dashboard rendering error: ${err.message}`);
    return bot.sendMessage(chatId, '❌ Error loading admin dashboard data.');
  }
};

/**
 * Sends detailed statistics report
 */
const sendDetailedStats = async (bot, chatId) => {
  try {
    const totalUsers = await User.countDocuments({});
    const verifiedUsers = await User.countDocuments({ verified: true });
    
    const pendingClaims = await Claim.countDocuments({ status: 'pending' });
    const approvedClaims = await Claim.countDocuments({ status: 'approved' });
    const rejectedClaims = await Claim.countDocuments({ status: 'rejected' });

    const activeChannels = await Channel.find({ active: true });
    const activeRewards = await Reward.find({ active: true });

    let channelList = activeChannels.map(c => `• ${c.title} (${c.chatId})`).join('\n') || 'None';
    let rewardList = activeRewards.map(r => `• ${r.title}: needs ${r.requiredRefs} refs`).join('\n') || 'None';

    const response = `📊 *Detailed Bot Statistics*\n\n` +
                     `👥 *User Summary:*\n` +
                     `  • Total registered: *${totalUsers}*\n` +
                     `  • Verified users: *${verifiedUsers}* (${totalUsers ? Math.round((verifiedUsers/totalUsers)*100) : 0}%)\n\n` +
                     `🎁 *Claims Summary:*\n` +
                     `  • Pending claims: *${pendingClaims}*\n` +
                     `  • Approved claims: *${approvedClaims}*\n` +
                     `  • Rejected claims: *${rejectedClaims}*\n\n` +
                     `📢 *Required Channels:*\n${channelList}\n\n` +
                     `🏆 *Milestone Rewards:*\n${rewardList}`;

    return bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error(`Detailed stats error: ${err.message}`);
    return bot.sendMessage(chatId, '❌ Failed to fetch detailed stats.');
  }
};

/**
 * Sends a list of pending claim requests with Approve/Reject inline buttons.
 */
const sendPendingClaims = async (bot, chatId) => {
  try {
    const pending = await Claim.find({ status: 'pending' }).populate('userId').populate('rewardId');
    
    if (pending.length === 0) {
      return bot.sendMessage(chatId, '🎉 *No pending claims!* All requests are up to date.', { parse_mode: 'Markdown' });
    }

    bot.sendMessage(chatId, `⏳ *Pending Claim Requests (${pending.length}):*`);

    for (const claim of pending) {
      const user = claim.userId;
      const reward = claim.rewardId;

      if (!user || !reward) continue;

      const username = user.username ? `@${user.username}` : 'No username';
      const text = `👤 *User:* ${user.firstName} (${username})\n` +
                   `🆔 *Telegram ID:* \`${user.telegramId}\`\n` +
                   `👥 *Current Referrals:* *${user.referrals}*\n` +
                   `🎁 *Reward:* *${reward.title}* (Needs ${reward.requiredRefs} refs)\n` +
                   `📅 *Requested:* ${new Date(claim.claimedAt).toLocaleString()}\n` +
                   `━━━━━━━━━━━━━━`;

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        ...getClaimReviewKeyboard(claim._id)
      });
      // Small artificial delay to ensure messages arrive in order
      await new Promise(r => setTimeout(r, 100));
    }
  } catch (err) {
    logger.error(`Pending claims error: ${err.message}`);
    return bot.sendMessage(chatId, '❌ Error loading pending claims.');
  }
};

/**
 * Exports users database to CSV and sends to admin.
 */
const handleExportCSV = async (bot, chatId) => {
  try {
    bot.sendMessage(chatId, '⚙️ Generating CSV file from database...');
    
    const users = await User.find({}).populate('referredBy');
    const csvContent = exportUsersToCSV(users);
    
    const scratchDir = path.join(__dirname, '../../scratch');
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
    
    const filename = `users_export_${Date.now()}.csv`;
    const filePath = path.join(scratchDir, filename);
    
    fs.writeFileSync(filePath, csvContent, 'utf-8');
    
    await bot.sendDocument(chatId, filePath, {}, {
      filename: `users_database_${new Date().toISOString().slice(0, 10)}.csv`,
      contentType: 'text/csv'
    });
    
    // Clean up file
    fs.unlinkSync(filePath);
    logger.info(`CSV exported and sent to admin: ${chatId}`);
  } catch (err) {
    logger.error(`CSV export error: ${err.message}`);
    bot.sendMessage(chatId, `❌ Failed to export CSV: ${err.message}`);
  }
};

/**
 * Runs the broadcast task in the background. Send to users one-by-one with delay.
 */
const runBroadcast = async (bot, adminChatId, text) => {
  try {
    const users = await User.find({});
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      try {
        await bot.sendMessage(user.telegramId, text, { parse_mode: 'Markdown' });
        successCount++;
      } catch (err) {
        // Log block errors or deactivations
        failCount++;
      }
      // Delay 40ms to maintain ~25 messages per second
      await new Promise(resolve => setTimeout(resolve, 40));
    }

    const report = `📢 *Broadcast Completed!*\n\n` +
                   `✅ Delivered: *${successCount}*\n` +
                   `❌ Failed (Blocked/Deactivated): *${failCount}*`;
    bot.sendMessage(adminChatId, report, { parse_mode: 'Markdown' })
      .catch(err => logger.error(`Failed to send broadcast report: ${err.message}`));
  } catch (err) {
    logger.error(`Broadcast runner error: ${err.message}`);
    bot.sendMessage(adminChatId, `❌ Broadcast failed: ${err.message}`)
      .catch(err => logger.error(`Failed to send broadcast fail message: ${err.message}`));
  }
};

/**
 * Handle settings dashboard
 */
const sendSettingsDashboard = async (bot, chatId) => {
  try {
    let settings = await Settings.findOne({});
    if (!settings) {
      settings = new Settings({});
      await settings.save();
    }

    const response = `⚙️ *Global Bot Settings*\n\n` +
                     `💬 Support Username: *${settings.supportUsername}*\n` +
                     `🤖 Bot Status: *${settings.botStatus ? 'ONLINE' : 'OFFLINE'}*\n\n` +
                     `Admin Commands to update settings:\n` +
                     `• Set Support: Send \`/setsupport <username>\` (e.g. \`/setsupport @MySupport\`)\n` +
                     `• Toggle Status: Send \`/togglestatus\``;

    return bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error(`Settings dashboard error: ${err.message}`);
    return bot.sendMessage(chatId, '❌ Failed to load settings.');
  }
};

module.exports = {
  handleAdminCommand,
  sendAdminDashboard,
  sendDetailedStats,
  sendPendingClaims,
  handleExportCSV,
  sendSettingsDashboard,
};
