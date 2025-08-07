// models/categorySchema.js
const mongoose = require('mongoose');

const { Schema } = mongoose;

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: false,
    default: ''
  },
  isListed: {
    type: Boolean,
    default: true
  },
  categoryOffer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Offer",
    default: null
  }
}, { timestamps: true });

const Category = mongoose.model("Category", categorySchema);

module.exports = Category;