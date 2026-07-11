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
  verificationTokenCreatedAt: {
    type: Date,
    default: null,
  },
  deviceFingerprint: {
    type: String,
    default: null,
    index: true,
  },
  deviceToken: {
    type: String,
    default: null,
    index: true,
  },
  deviceSpecs: {
    ram: { type: String, default: null },
    screen: { type: String, default: null },
    platform: { type: String, default: null },
    userAgent: { type: String, default: null },
    timezone: { type: String, default: null },
  },
  verifiedAtIST: {
    type: String,
    default: null,
  },
  suspicious: {
    type: Boolean,
    default: false,
    index: true,
  },
  flaggedReason: {
    type: String,
    default: null,
  },
  adminState: {
    type: String,
    default: null,
  },
  adminTempData: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for optimizing anti-farming query in verifyUser
userSchema.index({ referredBy: 1, verified: 1, verifiedAt: -1 });

module.exports = mongoose.model('User', userSchema);
