// models/couponSchema.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const couponSchema = new Schema({
    code: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        uppercase: true,
        match: /^[A-Z0-9]{1,15}$/
    },
    description: {
        type: String,
        trim: true,
        maxLength: 200
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage',
        required: true
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0
    },
    minPurchaseAmount: {
        type: Number,
        required: true,
        min: 1
    },
    maxDiscountAmount: {
        type: Number,
        required: true,
        min: 1
    },
    validFrom: {
        type: String,
        required: true
    },
    validUntil: {
        type: String,
        required: true
    },
    usageLimit: {
        type: Number,
        default: null,
        min: 1
    },
    usageCount: {
        type: Number,
        default: 0
    },
    perUserLimit: {
        type: Number,
        default: 1,
        min: 1
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Add index for performance
couponSchema.index({ isActive: 1, code: 1 });

// Validate percentage discount
couponSchema.path('discountValue').validate(function(value) {
    if (this.discountType === 'percentage') {
        return value <= 90 && value >= 0;
    }
    return true;
}, 'Percentage discount must be between 0 and 90%');

// Validate max discount vs min purchase
couponSchema.pre('save', function(next) {
    if (this.maxDiscountAmount >= this.minPurchaseAmount) {
        return next(new Error('Maximum discount amount must be less than minimum purchase amount'));
    }
    next();
});

const Coupon = mongoose.model('Coupon', couponSchema);
module.exports = Coupon;