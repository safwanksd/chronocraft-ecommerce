// models/cartSchema.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const cartSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true 
    },
    items: [{
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        variantIndex: { type: Number, required: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true }
    }],
    totalAmount: { type: Number, required: true, default: 0 }
}, { timestamps: true });


cartSchema.pre('save', function (next) {
    this.totalAmount = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    next();
});

module.exports = mongoose.model('Cart', cartSchema);