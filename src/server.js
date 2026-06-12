const express = require('express');
const connectDB = require('./config/db');
const config = require('./config');
const routes = require('./routes/api');
const logger = require('./utils/logger');

const Reward = require('./models/reward.model');
const Settings = require('./models/settings.model');

const app = express();

// 1. Connect to MongoDB
connectDB().then(() => {
  // Database Seeding Logic
  seedDatabase();
});

// 2. Parse incoming body updates
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Mount Routes
// Mount at '/' root to align webhook endpoints to exact WEBHOOK_URL/bot<TOKEN>
app.use('/', routes);

// 4. Initialize Bot Instance
// Requires bot/index.js which triggers connection (polling or webhooks)
const bot = require('./bot');

// 5. Database Auto-Seeding function
async function seedDatabase() {
  try {
    const rewardCount = await Reward.countDocuments({});
    if (rewardCount === 0) {
      const defaultRewards = [
        { title: 'Reward 1', description: 'Congratulations! You unlocked the Level 1 chest reward.', requiredRefs: 15 },
        { title: 'Reward 2', description: 'Great job! Level 2 milestone reached and reward unlocked.', requiredRefs: 30 },
        { title: 'Reward 3', description: 'Incredible! You have unlocked the Gold Level 3 chest reward.', requiredRefs: 50 },
        { title: 'Reward 4', description: 'Ultimate referrer! Level 4 VIP diamond chest reward unlocked.', requiredRefs: 100 },
      ];
      await Reward.insertMany(defaultRewards);
      logger.info('🏆 Database Seeding: Created 4 default reward milestones (15, 30, 50, 100 refs).');
    }

    const settingsCount = await Settings.countDocuments({});
    if (settingsCount === 0) {
      const defaultSettings = new Settings({
        supportUsername: '@piyushpathak7',
        dailyClaimLimit: 5,
        botStatus: true,
      });
      await defaultSettings.save();
      logger.info('⚙️ Database Seeding: Created default global settings.');
    }
  } catch (err) {
    logger.error(`❌ Database Seeding failed: ${err.message}`);
  }
}

// 6. Global Uncaught Exception handling
process.on('uncaughtException', (err) => {
  logger.error(`Critical Uncaught Exception: ${err.message}`, { stack: err.stack });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection at:', { promise, reason });
});

// 7. Start listening
app.listen(config.PORT, () => {
  logger.info(`🚀 Server running in ${config.NODE_ENV} mode on port ${config.PORT}`);
});
