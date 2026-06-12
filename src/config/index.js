require('dotenv').config();

const requiredEnv = ['TELEGRAM_BOT_TOKEN', 'MONGODB_URI', 'ADMIN_IDS'];
const missingEnv = requiredEnv.filter((env) => !process.env[env]);

if (missingEnv.length > 0) {
  console.error(`❌ Missing critical environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

// Convert ADMIN_IDS to array of numbers/strings
const adminIds = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(id => id.trim())
  : [];

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  ADMIN_IDS: adminIds,
  WEBHOOK_URL: process.env.WEBHOOK_URL || '',
  BOT_USERNAME: process.env.BOT_USERNAME || 'BestOffer_ReferBot', // Fallback username
};
