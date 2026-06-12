const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const User = require('../models/user.model');

const router = express.Router();

/**
 * GET /api/health
 * Simple health status checker for uptime monitoring.
 */
router.get('/health', (req, res) => {
  const connectionStates = {
    0: 'Disconnected',
    1: 'Connected',
    2: 'Connecting',
    3: 'Disconnecting'
  };

  const dbState = connectionStates[mongoose.connection.readyState] || 'Unknown';

  res.json({
    status: 'UP',
    database: dbState,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /verify
 * Serve the web verification landing page.
 */
router.get('/verify', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/verify.html'));
});

/**
 * POST /api/verify
 * Process security verification, perform unique IP check, and activate the user.
 */
router.post('/api/verify', async (req, res) => {
  const { userId, token } = req.body;

  if (!userId || !token) {
    return res.status(400).json({ error: 'Missing user ID or verification token.' });
  }

  try {
    const user = await User.findOne({ telegramId: userId });
    if (!user || user.verificationToken !== token) {
      return res.status(400).json({ error: 'Invalid or expired verification link.' });
    }

    if (user.verified) {
      return res.status(200).json({ message: 'Account is already verified.' });
    }

    // Get client IP
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ip = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : '';

    // Check loopback bypass for local development testing
    const isLocalIp = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';

    if (!isLocalIp) {
      // Check if another verified user has the same IP
      const duplicateIpUser = await User.findOne({ ipAddress: ip, verified: true });
      if (duplicateIpUser && duplicateIpUser.telegramId !== userId) {
        logger.warn(`⚠️ IP Verification Blocked: User ${userId} tried to verify using IP ${ip} which is already registered to user ${duplicateIpUser.telegramId}`);
        return res.status(400).json({ error: 'Device already verified: This device has already been used to verify a Telegram account.' });
      }
    }

    // Save IP address
    user.ipAddress = ip || 'local';
    await user.save();

    // Perform verification services
    const userService = require('../services/user.service');
    const bot = require('../bot');
    const { getMainMenuKeyboard } = require('../keyboards/reply');
    const { isAdmin } = require('../middleware/auth');

    await userService.verifyUser(bot, userId);

    // Notify user on Telegram
    bot.sendMessage(userId, '✅ *Verification Successful!*\n\nWelcome back! You can now use the reply menu below to earn rewards.', getMainMenuKeyboard(isAdmin(userId)))
      .catch((err) => logger.error(`Failed to send web verification success message to ${userId}: ${err.message}`));

    bot.sendMessage(userId, '🔗 Tap "My Referral Link" to share and start earning!')
      .catch(() => {});

    return res.status(200).json({ message: 'Verification successful.' });
  } catch (err) {
    logger.error(`Error in /api/verify route: ${err.message}`);
    return res.status(500).json({ error: 'Internal server error during verification.' });
  }
});

/**
 * POST /api/bot<TOKEN>
 * Webhook update receiver from Telegram servers.
 */
router.post(`/bot${config.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  try {
    // Dynamically require to avoid cyclic loading
    const bot = require('../bot');
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    logger.error(`Webhook payload process error: ${err.message}`);
    res.sendStatus(500);
  }
});

module.exports = router;
