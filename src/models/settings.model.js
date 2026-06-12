const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  supportUsername: {
    type: String,
    default: '@piyushpathak7',
    trim: true,
  },
  dailyClaimLimit: {
    type: Number,
    default: 5,
  },
  botStatus: {
    type: Boolean,
    default: true,
  },
  deviceVerify: {
    type: Boolean,
    default: true,
  },
  forceUsername: {
    type: Boolean,
    default: false,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Settings', settingsSchema);
