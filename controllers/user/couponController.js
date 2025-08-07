// controllers/user/couponController.js

const Coupon = require('../../models/couponSchema');
const Cart = require('../../models/cartSchema');
const Order = require('../../models/orderSchema');

// Retrieves available coupons for the user based on cart subtotal
const getAvailableCoupons = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const cart = await Cart.findOne({ user: userId });
        
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Your cart is empty' 
            });
        }

        // Calculate cart subtotal for coupon eligibility
        const subtotal = cart.items.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);

        // Get current date
        const today = new Date().toISOString().split('T')[0];

        // Find active coupons that meet the minimum purchase requirement
        const availableCoupons = await Coupon.find({
            isActive: true,
            minPurchaseAmount: { $lte: subtotal },
            validFrom: { $lte: today },
            validUntil: { $gte: today }
        }).select('code description discountType discountValue minPurchaseAmount maxDiscountAmount perUserLimit');

        // Find orders where this user has used each coupon
        const userOrders = await Order.find({ 
            user: userId,
            'coupon.code': { $exists: true, $ne: null }
        }).select('coupon.code');

        const usedCouponCodes = userOrders.map(order => order.coupon?.code).filter(Boolean);

        // Filter out coupons the user has already used (if perUserLimit is exceeded)
        const eligibleCoupons = availableCoupons.filter(coupon => {
            const usageCount = usedCouponCodes.filter(code => code === coupon.code).length;
            return usageCount < coupon.perUserLimit;
        });

        // Format coupon data for display
        const formattedCoupons = eligibleCoupons.map(coupon => {
            let discountText = coupon.discountType === 'percentage' 
                ? `${coupon.discountValue}% off` 
                : `₹${coupon.discountValue} off`;
                
            return {
                code: coupon.code,
                description: coupon.description,
                discountText: discountText,
                minPurchase: `₹${coupon.minPurchaseAmount.toLocaleString('en-IN')}`,
                maxDiscount: coupon.maxDiscountAmount ? `Up to ₹${coupon.maxDiscountAmount.toLocaleString('en-IN')}` : ''
            };
        });

        res.status(200).json({
            success: true,
            coupons: formattedCoupons
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('[COUPON] Error fetching available coupons:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch available coupons'
        });
    }
};

// Applies a coupon to the user's cart if valid
const applyCoupon = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { couponCode } = req.body;
        
        if (!couponCode) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a coupon code'
            });
        }

        // Find user's cart
        const cart = await Cart.findOne({ user: userId });
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Your cart is empty'
            });
        }

        // Calculate current subtotal
        const subtotal = cart.items.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
        
        // Get current date in ISO format (YYYY-MM-DD)
        const today = new Date().toISOString().split('T')[0];
        
        // Find the coupon
        const coupon = await Coupon.findOne({
            code: couponCode.toUpperCase(),
            isActive: true,
            validFrom: { $lte: today },
            validUntil: { $gte: today }
        });

        // Handle coupon not found or expired
        if (!coupon) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired coupon code'
            });
        }

        // Check if cart meets minimum purchase requirement
        if (subtotal < coupon.minPurchaseAmount) {
            return res.status(400).json({
                success: false,
                message: `Minimum purchase of ₹${coupon.minPurchaseAmount.toLocaleString('en-IN')} required to use this coupon`
            });
        }

        // Check if coupon usage limit is reached
        if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
            return res.status(400).json({
                success: false,
                message: 'This coupon has reached its usage limit'
            });
        }

        // Check if user has already used this coupon beyond their limit
        const userOrdersWithCoupon = await Order.countDocuments({
            user: userId,
            'coupon.code': coupon.code
        });

        if (userOrdersWithCoupon >= coupon.perUserLimit) {
            return res.status(400).json({
                success: false,
                message: 'You have already used this coupon'
            });
        }

        // Calculate discount amount
        let discountAmount = 0;
        if (coupon.discountType === 'percentage') {
            discountAmount = (subtotal * coupon.discountValue) / 100;
        } else {
            discountAmount = coupon.discountValue;
        }

        // Apply maximum discount limit if specified
        if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
            discountAmount = coupon.maxDiscountAmount;
        }

        // Update cart with applied coupon and discount
        cart.appliedCoupon = coupon.code;
        cart.discount = discountAmount;
        await cart.save();

        // Calculate final amount with discount
        const gstAmount = subtotal * 0.12; // 12% GST
        const shippingFee = 100; // Standard shipping fee
        const totalAmount = subtotal + gstAmount + shippingFee - discountAmount;

        res.status(200).json({
            success: true,
            message: 'Coupon applied successfully',
            discount: discountAmount,
            discountFormatted: `₹${discountAmount.toLocaleString('en-IN')}`,
            subtotal: subtotal,
            subtotalFormatted: `₹${subtotal.toLocaleString('en-IN')}`,
            gstAmount: gstAmount,
            gstAmountFormatted: `₹${gstAmount.toLocaleString('en-IN')}`,
            shippingFee: shippingFee,
            shippingFeeFormatted: `₹${shippingFee.toLocaleString('en-IN')}`,
            totalAmount: totalAmount,
            totalAmountFormatted: `₹${totalAmount.toLocaleString('en-IN')}`
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('[COUPON] Error applying coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to apply coupon'
        });
    }
};

// Removes an applied coupon from the user's cart
const removeCoupon = async (req, res) => {
    try {
        const userId = req.session.user._id;
        
        // Find user's cart
        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(400).json({
                success: false,
                message: 'Cart not found'
            });
        }

        // Check if a coupon is applied
        if (!cart.appliedCoupon) {
            return res.status(400).json({
                success: false,
                message: 'No coupon applied to remove'
            });
        }

        // Calculate current subtotal
        const subtotal = cart.items.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
        
        // Remove coupon and discount from cart
        cart.appliedCoupon = null;
        cart.discount = 0;
        await cart.save();

        // Calculate new total without discount
        const gstAmount = subtotal * 0.12; // 12% GST
        const shippingFee = 100; // Standard shipping fee
        const totalAmount = subtotal + gstAmount + shippingFee;

        res.status(200).json({
            success: true,
            message: 'Coupon removed successfully',
            subtotal: subtotal,
            subtotalFormatted: `₹${subtotal.toLocaleString('en-IN')}`,
            gstAmount: gstAmount,
            gstAmountFormatted: `₹${gstAmount.toLocaleString('en-IN')}`,
            shippingFee: shippingFee,
            shippingFeeFormatted: `₹${shippingFee.toLocaleString('en-IN')}`,
            totalAmount: totalAmount,
            totalAmountFormatted: `₹${totalAmount.toLocaleString('en-IN')}`
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('[COUPON] Error removing coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove coupon'
        });
    }
};

module.exports = {
    getAvailableCoupons,
    applyCoupon,
    removeCoupon
};