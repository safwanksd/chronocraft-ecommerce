// models/orderSchema.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
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
        price: {
            type: Number,
            required: true
        },
        status: {   
            itemStatus: {
                type: String,
                enum: ['Processing', 'Shipped', 'Delivered', 'Cancelled'],
                default: 'Processing'
            },
            return: {
                requested: {
                    type: Boolean,
                    default: false
                },
                status: {
                    type: String,
                    enum: ['Pending', 'Approved', 'Rejected'],
                    default: 'Pending'
                },
                reason: {
                    type: String,
                    required: function() { return this.requested; }
                },
                requestDate: {
                    type: Date
                }
            }
        }
    }],
    shippingAddress: {
        type: Schema.Types.ObjectId,
        ref: 'Address',
        required: true
    },
    payment: {  
        method: {
            type: String,
            enum: ['COD', 'RAZORPAY', 'WALLET'], 
            required: true
        },
        status: {
            type: String,
            enum: ['Pending', 'Completed', 'Failed', 'Order Cancelled', 'Refunded'],
            default: 'Pending'
        },
        razorpayPaymentId: {
            type: String,
            required: function() { return this.method === 'razorpay' && this.status === 'Completed'; }
        },
        razorpayOrderId: {
            type: String,
            required: function() { return this.method === 'razorpay'; }
        }
    },
    coupon: {
        code: { type: String, default: null },
        discountAmount: { type: Number, default: 0 }
    },
    pricing: {
        subtotal: {
            type: Number,
            required: true
        },
        shippingFee: {
            type: Number,
            required: true,
            default: 100
        },
        finalAmount: {
            type: Number,
            required: true
        }
    },
    orderStatus: {
        type: String,
        enum: ['Processing', 'Shipped', 'Delivered', 'Cancelled', 'Failed', 'Return Requested', 'Returned'],
        default: 'Processing'
    },
    cancelReason: {
        type: String
    },
    orderNumber: {
        type: String,
        unique: true,
        required: true
    },
    expectedDeliveryDate: {
        type: Date,
        default: function() {
            const today = new Date();
            return new Date(today.setDate(today.getDate() + 5)); // 5 days from now
        }
    }
}, {
    timestamps: true
});

// Index for faster queries
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ 'payment.status': 1 });

orderSchema.pre('save', async function(next) {
    if (!this.orderNumber) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const datePrefix = `ORD${year}${month}${day}`;

        const latestOrder = await this.constructor.findOne()
            .sort({ createdAt: -1 })
            .where('orderNumber').regex(new RegExp(`^${datePrefix}`));
        
        let sequence = 1;
        if (latestOrder) {
            const latestSeq = parseInt(latestOrder.orderNumber.slice(-4)) || 0;
            sequence = latestSeq + 1;
        }
        this.orderNumber = `${datePrefix}${String(sequence).padStart(4, '0')}`;
    }
    next();
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;