
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
        product: { 
            type: Schema.Types.ObjectId, 
            ref: 'Product', 
            required: true 
        },
        variantIndex: { 
            type: Number, 
            required: true 
        },
        quantity: { 
            type: Number, 
            required: true, 
            min: 1 
        },
        salePrice: { 
            type: Number, 
            required: true 
        } 
    }],
    totalAmount: { 
        type: Number, 
        required: true, 
        default: 0 
    },
    appliedCoupon: { 
        type: String, 
        default: null 
    }, 
    discount: { 
        type: Number, 
        default: 0 
    } 
}, { timestamps: true });

module.exports = mongoose.model('Cart', cartSchema);