// controllers/user/checkoutController.js

const Razorpay = require('razorpay');
const config = require('../../config/config');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/couponSchema');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Initialize Razorpay instance
const razorpayInstance = new Razorpay({
    key_id: config.razorpay.keyId,
    key_secret: config.razorpay.keySecret,
});

// Renders the checkout page with cart details and available addresses
const getCheckout = async (req, res) => {
    try {
        const cart = await Cart.findOne({ user: req.session.user._id })
            .populate({
                path: 'items.product',
                populate: [
                    { path: 'category', select: 'name isListed' },
                    { path: 'brand', select: 'isBlocked' }
                ]
            });

        if (!cart || cart.items.length === 0) {
            return res.redirect('/user/cart?message=Your cart is empty.');
        }

        // Track filtered items and reasons
        const unavailableItems = [];
        const originalItemCount = cart.items.length;

        // Filter blocked/unlisted products / out-of-stock items
        cart.items = cart.items.filter(item => {
            const product = item.product;
            const variant = product.variants[item.variantIndex];
            let isValid = true;
            let reason = '';

            if (product.isBlocked) {
                reason = 'Blocked Product';
                isValid = false;
            } else if (!product.category.isListed) {
                reason = 'Category Unlisted';
                isValid = false;
            } else if (product.brand.isBlocked) {
                reason = 'Brand Blocked';
                isValid = false;
            } else if (variant.stock < item.quantity) {
                reason = `Insufficient Stock (Only ${variant.stock} available)`;
                isValid = false;
            }

            if (!isValid) {
                unavailableItems.push({
                    productName: product.productName,
                    colorName: variant.colorName,
                    reason: reason
                });
            }

            return isValid;
        });

        // If all items are filtered out, redirect to cart with error message
        if (cart.items.length === 0) {
            const errorMessage = unavailableItems.map(item => `${item.productName} (${item.colorName}): ${item.reason}`).join(', ');
            return res.redirect(`/user/cart?unavailableItems=${encodeURIComponent(JSON.stringify(unavailableItems))}`);
        }

        // Recalculate subtotal using salePrice from the product's variant
        const subtotal = cart.items.reduce((sum, item) => {
            const salePrice = item.product.variants[item.variantIndex].salePrice || 0;
            return sum + (salePrice * item.quantity);
        }, 0);

        const gstRate = 0.12; // 12% GST
        const shippingFee = 100;
        const discount = cart.discount || 0;
        const gstAmount = subtotal * gstRate;
        const totalAmount = subtotal + gstAmount + shippingFee - discount;

        const addresses = await Address.find({ user: req.session.user._id });

        // Fetch wallet balance
        const wallet = await Wallet.findOne({ userId: req.session.user._id });
        const walletBalance = wallet ? wallet.balance : 0;

        // Pass unavailable items to the checkout page if some items were filtered out
        const filteredItemCount = originalItemCount - cart.items.length;
        res.render('user/checkout', {
            cart,
            addresses,
            subtotal,
            gstAmount,
            shippingFee,
            discount,
            totalAmount,
            walletBalance,
            appliedCoupon: cart.appliedCoupon,
            user: req.session.user,
            razorpayKeyId: config.razorpay.keyId,
            unavailableItems: filteredItemCount > 0 ? unavailableItems : null
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('[CHECKOUT] Error fetching checkout page:', error);
        res.status(500).render('error', { message: 'Server Error' });
    }
};

// Initiates a Razorpay payment for the order
const initiatePayment = async (req, res) => {
    try {
        const { orderId, amount } = req.body;
        if (!orderId || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Order ID and amount are required.',
            });
        }

        const options = {
            amount: Math.round(amount * 100), // Convert to paise
            currency: 'INR',
            receipt: orderId.toString(),
        };

        const razorpayOrder = await razorpayInstance.orders.create(options);
        res.status(200).json({
            success: true,
            order: razorpayOrder,
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('[CHECKOUT] Payment initiation error:', error);
        if (error.statusCode === 401) {
            res.status(401).json({
                success: false,
                message: 'Authentication failed. Please check Razorpay credentials.',
            });
        } else {
            res.status(500).json({
                success: false,
                message: `Error initiating payment: ${error.error?.description || error.message}`,
            });
        }
    }
};

// Verifies the Razorpay payment signature and updates order status
const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

        // Verify payment signature
        const hmac = crypto.createHmac('sha256', config.razorpay.keySecret);
        hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
        const generatedSignature = hmac.digest('hex');

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (generatedSignature === razorpay_signature) {
            // Payment successful
            order.payment.status = 'Completed';
            order.payment.razorpayPaymentId = razorpay_payment_id;
            order.payment.razorpayOrderId = razorpay_order_id;
            order.orderStatus = 'Processing';

            // If the order was previously Failed, re-decrease the stock
            if (order.orderStatus === 'Failed') {
                for (const item of order.items) {
                    const product = await Product.findById(item.product);
                    if (product && product.variants[item.variantIndex]) {
                        const variant = product.variants[item.variantIndex];
                        if (variant.stock < item.quantity) {
                            return res.status(400).json({
                                success: false,
                                message: `Insufficient stock for ${product.productName} (${variant.colorName}). Please place a new order.`
                            });
                        }
                        variant.stock -= item.quantity;
                        await product.save();
                    }
                }
            }

            await order.save();

            // Clear cart after successful Razorpay payment
            await Cart.findOneAndDelete({ user: req.session.user._id });
            res.status(200).json({ success: true, message: 'Payment verified successfully' });
        } else {
            // Payment failed
            order.payment.status = 'Failed';
            order.orderStatus = 'Failed';

            // Rollback stock changes if this is the first failure
            if (order.orderStatus !== 'Failed') {
                for (const item of order.items) {
                    const product = await Product.findById(item.product);
                    if (product && product.variants[item.variantIndex]) {
                        product.variants[item.variantIndex].stock += item.quantity;
                        await product.save();
                    }
                }
            }

            await order.save();
            res.status(400).json({ success: false, message: 'Payment verification failed' });
        }
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('[CHECKOUT] Payment verification error:', error);
        res.status(500).json({ success: false, message: 'Error verifying payment' });
    }
};

// Processes and places a new order based on cart and payment method
const placeOrder = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { addressId, paymentMethod = 'cod' } = req.body;

        // Validate user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // Validate address
        const address = await Address.findById(addressId);
        if (!address) {
            return res.status(404).json({ success: false, message: 'Address not found.' });
        }

        // Fetch cart
        const cart = await Cart.findOne({ user: userId }).populate({
            path: 'items.product',
            select: 'productName variants'
        });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty.' });
        }

        // Map cart items to order items
        const orderItems = cart.items.map(item => ({
            product: item.product._id,
            variantIndex: item.variantIndex,
            quantity: item.quantity,
            price: Number(item.product.variants[item.variantIndex].salePrice) || 0
        }));

        // Recheck stock for all items before proceeding
        for (const item of orderItems) {
            const product = await Product.findById(item.product);
            if (!product || !product.variants[item.variantIndex]) {
                return res.status(400).json({
                    success: false,
                    message: `Product or variant not found for ${item.product}. Please update your cart.`
                });
            }
            const variant = product.variants[item.variantIndex];
            if (variant.stock < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.productName} (${variant.colorName}). Please update your cart.`
                });
            }
        }

        // Calculate pricing
        const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shippingFee = 100;
        const discount = cart.discount || 0;
        const gstAmount = subtotal * 0.12;
        const totalAmount = subtotal + gstAmount + shippingFee - discount;

        // Normalize payment method to uppercase
        const normalizedPaymentMethod = paymentMethod.toUpperCase();
        if (!['COD', 'RAZORPAY', 'WALLET'].includes(normalizedPaymentMethod)) {
            return res.status(400).json({ success: false, message: 'Invalid payment method.' });
        }

        // Add COD restriction for orders above ₹5000
        if (normalizedPaymentMethod === 'COD' && totalAmount > 5000) {
            return res.status(400).json({
                success: false,
                message: 'Cash on Delivery is not available for orders above ₹5000. Please choose another payment method.'
            });
        }

        // Decrease stock for all items
        for (const item of orderItems) {
            const product = await Product.findById(item.product);
            const variant = product.variants[item.variantIndex];
            variant.stock -= item.quantity;
            await product.save();
        }

        let paymentStatus = 'Pending';
        let orderStatus = 'Processing';
        if (normalizedPaymentMethod === 'RAZORPAY') {
            paymentStatus = 'Pending';
        } else if (normalizedPaymentMethod === 'COD') {
            paymentStatus = 'Pending';
        } else if (normalizedPaymentMethod === 'WALLET') {
            paymentStatus = 'Completed';
        }

        const order = new Order({
            user: userId,
            items: orderItems,
            shippingAddress: addressId,
            payment: { method: normalizedPaymentMethod, status: paymentStatus },
            pricing: { 
                subtotal, 
                shippingFee, 
                discount,
                finalAmount: totalAmount 
            },
            coupon: cart.appliedCoupon ? { code: cart.appliedCoupon, discount: cart.discount } : null,
            orderStatus: orderStatus,
        });

        // Generate order number
        if (!order.orderNumber) {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            const datePrefix = `ORD${year}${month}${day}`;

            const latestOrder = await Order.findOne()
                .sort({ createdAt: -1 })
                .where('orderNumber').regex(new RegExp(`^${datePrefix}`));
            
            let sequence = 1;
            if (latestOrder) {
                const latestSeq = parseInt(latestOrder.orderNumber.slice(-4)) || 0;
                sequence = latestSeq + 1;
            }
            order.orderNumber = `${datePrefix}${String(sequence).padStart(4, '0')}`;
        }

        await order.save();

        // Handle wallet payment after order is saved
        if (normalizedPaymentMethod === 'WALLET') {
            let wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                wallet = new Wallet({ userId, balance: 0, transactions: [] });
                await wallet.save();
            }

            // Check if wallet balance is sufficient
            if (wallet.balance < totalAmount) {
                // Rollback stock changes if payment fails
                for (const item of orderItems) {
                    const product = await Product.findById(item.product);
                    const variant = product.variants[item.variantIndex];
                    variant.stock += item.quantity;
                    await product.save();
                }
                // Update order status to 'Failed'
                order.orderStatus = 'Failed';
                order.payment.status = 'Failed';
                await order.save();
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient wallet balance to complete the payment.'
                });
            }

            // Deduct the amount from the wallet and add transaction
            wallet.balance -= totalAmount;
            wallet.transactions.push({
                type: 'Purchase',
                amount: totalAmount,
                orderId: order._id.toString(),
                status: 'Completed',
                description: `Payment for order #${order.orderNumber}`
            });
            await wallet.save();
        }

        // Increment coupon usage count if a coupon was applied
        if (cart.appliedCoupon) {
            await Coupon.findOneAndUpdate(
                { code: cart.appliedCoupon },
                { $inc: { usageCount: 1 } }
            );
        }

        // Clear cart for COD and Wallet orders
        if (normalizedPaymentMethod === 'COD' || normalizedPaymentMethod === 'WALLET') {
            await Cart.findOneAndDelete({ user: userId });
            return res.status(200).json({
                success: true,
                orderId: order._id,
                orderNumber: order.orderNumber,
                message: 'Order placed successfully!'
            });
        } else if (normalizedPaymentMethod === 'RAZORPAY') {
            return res.status(200).json({
                success: true,
                orderId: order._id,
                orderNumber: order.orderNumber,
                totalAmount: totalAmount,
                paymentMethod: 'razorpay'
            });
        }
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('[CHECKOUT] Error placing order:', error);
        return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

// Renders the order success page for a given order
const getOrderSuccess = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId)
            .populate('user')
            .populate({
                path: 'items.product',
                populate: { path: 'category', select: 'name' }
            })
            .populate('shippingAddress');

        if (!order || order.user._id.toString() !== req.session.user._id) {
            return res.status(404).render('user/page-404', { message: 'Order not found or unauthorized.' });
        }

        res.render('user/order-success', { order, user: req.session.user });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('[CHECKOUT] Error fetching order success page:', error);
        res.status(500).render('error', { message: 'Server Error' });
    }
};

// Renders the order failure page for a given order
const getOrderFailure = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId)
            .populate('user')
            .populate({
                path: 'items.product',
                populate: { path: 'category', select: 'name' }
            })
            .populate('shippingAddress');

        if (!order || order.user._id.toString() !== req.session.user._id) {
            return res.status(404).render('user/page-404', { message: 'Order not found or unauthorized.' });
        }

        res.render('user/order-failure', { 
            order, 
            user: req.session.user,
            razorpayKeyId: config.razorpay.keyId
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('[CHECKOUT] Error fetching order failure page:', error);
        res.status(500).render('error', { message: 'Server Error' });
    }
};

module.exports = {
    getCheckout,
    initiatePayment,
    verifyPayment,
    placeOrder,
    getOrderSuccess,
    getOrderFailure,
};