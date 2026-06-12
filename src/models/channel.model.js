const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  chatId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  inviteLink: {
    type: String,
    required: true,
    trim: true,
  },
  active: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Channel', channelSchema);
