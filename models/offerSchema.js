// models/offerSchema.js
const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ['product', 'category'],
    required: true,
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'type', 
  },
  discount: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

// Index for efficient querying
offerSchema.index({ type: 1, targetId: 1 });

// Validate that startDate is before endDate
offerSchema.pre('save', function (next) {
  if (this.startDate >= this.endDate) {
    return next(new Error('Start date must be before end date'));
  }
  // Strip time from dates
  if (this.startDate) {
    this.startDate = new Date(this.startDate.toISOString().split('T')[0]);
  }
  if (this.endDate) {
    this.endDate = new Date(this.endDate.toISOString().split('T')[0]);
  }
  next();
});

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;