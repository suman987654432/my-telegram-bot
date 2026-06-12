const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  username: {
    type: String,
    trim: true,
  },
  firstName: {
    type: String,
    required: true,
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  referrals: {
    type: Number,
    default: 0,
  },
  verified: {
    type: Boolean,
    default: false,
    index: true,
  },
  verifiedAt: {
    type: Date,
    default: null,
  },
  claimedRewards: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reward',
    },
  ],
  captchaAnswer: {
    type: String,
    default: null,
  },
  ipAddress: {
    type: String,
    default: null,
    index: true,
  },
  verificationToken: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);
