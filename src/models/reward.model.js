const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  requiredRefs: {
    type: Number,
    required: true,
    min: 1,
    unique: true, // Prevent rewards with duplicate thresholds
  },
  active: {
    type: Boolean,
    default: true,
  },
  codes: {
    type: [String],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Reward', rewardSchema);
