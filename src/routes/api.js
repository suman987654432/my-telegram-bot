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

    if (computedHash === hash) {
      const result = {};
      for (const [key, value] of params.entries()) {
        try {
          result[key] = JSON.parse(value);
        } catch (e) {
          result[key] = value;
        }
      }
      return result;
    }
    return false;
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
  try {
    const { userId, token, initData, tgPlatform, tgVersion, fingerprint, deviceToken, deviceSpecs } = req.body;

    if (!userId || !token) {
      return res.status(400).json({ error: 'Missing required parameters.' });
    }

    // 0. Strict Anti-Modded Client Check (The Turbotel/Script Killer)
    if (deviceSpecs && tgPlatform) {
      const ua = (deviceSpecs.userAgent || '').toLowerCase();
      
      // Block known modded names
      if (ua.includes('turbotel') || ua.includes('plusmessenger') || ua.includes('bgram') || ua.includes('headless') || ua.includes('puppeteer')) {
        logger.warn(`⚠️ Modded Client Blocked: User ${userId} used forbidden app in UserAgent.`);
        return res.status(400).json({ error: 'Security violation: Unofficial or modified Telegram clients are strictly prohibited.' });
      }

      // Enforce Official App Signatures
      if (tgPlatform === 'android' && !ua.includes('telegram-android')) {
        logger.warn(`⚠️ Unofficial Client Blocked: User ${userId} claimed android but missing Telegram-Android in UserAgent.`);
        return res.status(400).json({ error: 'Verification blocked: Please use the OFFICIAL Telegram Android app.' });
      }
      
      if (tgPlatform === 'ios' && !ua.includes('telegram-ios')) {
        logger.warn(`⚠️ Unofficial Client Blocked: User ${userId} claimed ios but missing Telegram-iOS in UserAgent.`);
        return res.status(400).json({ error: 'Verification blocked: Please use the OFFICIAL Telegram iOS app.' });
      }
    }

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
      const validatedData = verifyInitData(initData, config.TELEGRAM_BOT_TOKEN);
      if (!validatedData) {
        logger.warn(`⚠️ WebApp Spoofing Blocked: User ${userId} sent invalid cryptographic signature.`);
        return res.status(400).json({ error: 'Security verification failed: Please open the verification page inside the official Telegram app.' });
      }

      // Replay Attack Prevention (auth_date is in seconds)
      const authDate = parseInt(validatedData.auth_date);
      const now = Math.floor(Date.now() / 1000);
      if (now - authDate > 600) { // 10 minutes limit
        logger.warn(`⚠️ Replay Attack Blocked: User ${userId} used expired initData.`);
        return res.status(400).json({ error: 'Session expired. Please reopen the verification page.' });
      }

      // Cross-Account Spoofing Prevention
      const initDataUserId = validatedData.user ? String(validatedData.user.id) : null;
      if (initDataUserId !== String(userId)) {
        logger.warn(`⚠️ Cross-Account Spoofing Blocked: initData user ID ${initDataUserId} does not match request user ID ${userId}.`);
        return res.status(400).json({ error: 'Security verification failed: User ID mismatch.' });
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
        // Enforce India Timezone to block VPNs and randomizing Clones (Allow Kolkata and Calcutta)
        if (deviceSpecs.timezone && deviceSpecs.timezone !== 'Asia/Kolkata' && deviceSpecs.timezone !== 'Asia/Calcutta') {
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
      .catch(() => { });

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
