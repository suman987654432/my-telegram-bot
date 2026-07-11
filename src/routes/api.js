const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const User = require('../models/user.model');
const Settings = require('../models/settings.model');

const router = express.Router();

/**
 * Validate Telegram Web App initData signature cryptographically using bot token
 */
function verifyInitData(initDataString, botToken) {
  if (!initDataString) return false;
  try {
    const params = new URLSearchParams(initDataString);
    const hash = params.get('hash');
    if (!hash) return false;
    params.delete('hash');
    
    const sortedKeys = Array.from(params.keys()).sort();
    const dataCheckString = sortedKeys.map(key => `${key}=${params.get(key)}`).join('\n');
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    return computedHash === hash;
  } catch (err) {
    return false;
  }
}

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
  const { userId, token, initData, fingerprint, deviceToken, deviceSpecs } = req.body;

  if (!userId || !token) {
    return res.status(400).json({ error: 'Missing user ID or verification token.' });
  }

  try {
    const user = await User.findOne({ telegramId: userId });
    if (!user || user.verificationToken !== token) {
      return res.status(400).json({ error: 'Invalid verification link.' });
    }

    if (user.verified) {
      return res.status(200).json({ message: 'Account is already verified.' });
    }

    // 1. Verification Token Expiration Check (10 minutes)
    if (user.verificationTokenCreatedAt) {
      const tokenAge = Date.now() - new Date(user.verificationTokenCreatedAt).getTime();
      if (tokenAge > 10 * 60 * 1000) {
        return res.status(400).json({ error: 'Verification link expired. Please request a new verification link from the Telegram bot.' });
      }
    }

    // Fetch Global Bot Settings
    let settings = await Settings.findOne({});
    if (!settings) {
      settings = new Settings({});
      await settings.save();
    }

    // 2. Optional Username Requirement Check
    if (settings.forceUsername && !user.username) {
      return res.status(400).json({ error: 'Username required: Please set a public username (@username) in your Telegram settings before verifying.' });
    }

    // Get client IP (Express automatically parses x-forwarded-for when trust proxy is enabled)
    const rawIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ip = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : '';

    // Check loopback bypass for local development testing
    const isLocalIp = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';

    // 3. Telegram Web App Cryptographic Signature Check (Enforced in Production Only)
    const isProduction = !!config.WEBHOOK_URL;
    if (isProduction && !isLocalIp) {
      if (!verifyInitData(initData, config.TELEGRAM_BOT_TOKEN)) {
        logger.warn(`⚠️ WebApp Spoofing Blocked: User ${userId} sent invalid cryptographic signature.`);
        return res.status(400).json({ error: 'Security verification failed: Please open the verification page inside the official Telegram app.' });
      }
    }

    // 4. Double IP and Fingerprint verification check (if enabled)
    if (settings.deviceVerify && !isLocalIp) {
      // Check IP uniqueness
      const duplicateIpUser = await User.findOne({ ipAddress: ip, verified: true });
      if (duplicateIpUser && duplicateIpUser.telegramId !== userId) {
        logger.warn(`⚠️ IP Verification Blocked: User ${userId} tried to verify using IP ${ip} which is already registered to user ${duplicateIpUser.telegramId}`);
        return res.status(400).json({ error: 'Device already verified: This device has already been used to verify a Telegram account.' });
      }

      // Check Fingerprint uniqueness
      if (fingerprint) {
        const duplicateFingerprintUser = await User.findOne({ deviceFingerprint: fingerprint, verified: true });
        if (duplicateFingerprintUser && duplicateFingerprintUser.telegramId !== userId) {
          logger.warn(`⚠️ Fingerprint Verification Blocked: User ${userId} tried to verify using device fingerprint ${fingerprint} which is already registered to user ${duplicateFingerprintUser.telegramId}`);
          return res.status(400).json({ error: 'Device already verified: This device has already been used to verify a Telegram account.' });
        }
      }

      // Check LocalStorage Device Token uniqueness
      if (deviceToken) {
        const duplicateTokenUser = await User.findOne({ deviceToken: deviceToken, verified: true });
        if (duplicateTokenUser && duplicateTokenUser.telegramId !== userId) {
          logger.warn(`⚠️ Device Token Blocked: User ${userId} tried to verify using device token ${deviceToken} which is already registered to user ${duplicateTokenUser.telegramId}`);
          return res.status(400).json({ error: 'Device already verified: This device has already been used to verify a Telegram account.' });
        }
      }
      
      // Strict Anti-Cheat: Timezone & Emulator Check
      if (deviceSpecs) {
        // Enforce India Timezone to block VPNs and randomizing Clones
        if (deviceSpecs.timezone && deviceSpecs.timezone !== 'Asia/Kolkata') {
           logger.warn(`⚠️ Timezone Blocked: User ${userId} has suspicious timezone: ${deviceSpecs.timezone}`);
           return res.status(400).json({ error: 'Verification blocked: VPNs or Clone apps are strictly prohibited.' });
        }
        
        // Block obvious missing data from clone apps
        if (deviceSpecs.platform === 'unknown' || deviceSpecs.userAgent === 'unknown') {
           logger.warn(`⚠️ Clone App Blocked: User ${userId} missing device specs.`);
           return res.status(400).json({ error: 'Verification blocked: Invalid device environment detected.' });
        }
      }
    }

    // Save Device Details and IP
    user.ipAddress = ip || 'local';
    if (fingerprint) {
      user.deviceFingerprint = fingerprint;
    }
    if (deviceToken) {
      user.deviceToken = deviceToken;
    }
    if (deviceSpecs) {
      user.deviceSpecs = {
        ram: deviceSpecs.ram || 'unknown',
        screen: deviceSpecs.screen || 'unknown',
        platform: deviceSpecs.platform || 'unknown',
        userAgent: deviceSpecs.userAgent || 'unknown',
        timezone: deviceSpecs.timezone || 'unknown'
      };
    }

    // 5. Save Verification Timestamp in Indian Standard Time (IST)
    const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    user.verifiedAtIST = new Date().toLocaleString('en-US', options);

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
