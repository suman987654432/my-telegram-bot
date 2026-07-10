const Channel = require('../models/channel.model');
const Settings = require('../models/settings.model');
const logger = require('../utils/logger');

let cache = {
  channels: null,
  settings: null,
  lastUpdated: 0
};

// Cache Time-To-Live in milliseconds (e.g. 5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

const getActiveChannels = async () => {
  if (cache.channels && (Date.now() - cache.lastUpdated < CACHE_TTL)) {
    return cache.channels;
  }
  try {
    cache.channels = await Channel.find({ active: true });
    cache.lastUpdated = Date.now();
    return cache.channels;
  } catch (err) {
    logger.error(`Error fetching channels for cache: ${err.message}`);
    return [];
  }
};

const getGlobalSettings = async () => {
  if (cache.settings && (Date.now() - cache.lastUpdated < CACHE_TTL)) {
    return cache.settings;
  }
  try {
    let settings = await Settings.findOne({});
    if (!settings) {
      settings = new Settings({});
      await settings.save();
    }
    cache.settings = settings;
    cache.lastUpdated = Date.now();
    return cache.settings;
  } catch (err) {
    logger.error(`Error fetching settings for cache: ${err.message}`);
    return null; // Fallback
  }
};

const invalidateCache = () => {
  cache.channels = null;
  cache.settings = null;
  cache.lastUpdated = 0;
  logger.info('In-memory database cache invalidated.');
};

module.exports = {
  getActiveChannels,
  getGlobalSettings,
  invalidateCache
};
