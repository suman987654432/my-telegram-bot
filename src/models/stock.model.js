const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  codes: [{
    type: String,
    trim: true,
  }],
  active: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Stock', stockSchema);
