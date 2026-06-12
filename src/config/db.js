const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger'); // We will create the logger next

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.MONGODB_URI);
    logger.info(`💾 MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`❌ MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('💾 MongoDB disconnected. Retrying...');
});

mongoose.connection.on('error', (err) => {
  logger.error(`💾 MongoDB connection event error: ${err.message}`);
});

module.exports = connectDB;
