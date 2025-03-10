// controllers/user/checkoutController.js
const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema"); 
const Wallet = require("../../models/walletSchema");

const getCheckout = async (req, res) => {
    console.log('[CHECKOUT] Fetching checkout page for user:', req.session.user._id);
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

        // Filter out blocked/unlisted products or out-of-stock items
        cart.items = cart.items.filter(item => {
            const product = item.product;
            const variant = product.variants[item.variantIndex];
            return !product.isBlocked && product.category.isListed && !product.brand.isBlocked && variant.stock >= item.quantity;
        });

        if (cart.items.length === 0) {
            return res.redirect('/user/cart?message=No valid items in cart.');
        }

        // Recalculate totalAmount after filtering
        cart.totalAmount = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        await cart.save();

        const addresses = await Address.find({ user: req.session.user._id });

        // Calculate totals
        const subtotal = cart.totalAmount;
        const gstRate = 0.12; // 12% GST
        const gstAmount = subtotal * gstRate; // Calculate 12% GST on subtotal
        const shippingFee = 100;
        const totalAmount = subtotal + gstAmount + shippingFee;

        res.render("user/checkout", { 
            cart, 
            addresses, 
            subtotal, 
            gstAmount, // Still passed for checkout display
            shippingFee, 
            totalAmount,
            user: req.session.user 
        });
    } catch (error) {
        console.error('[CHECKOUT] Error fetching checkout page:', error);
        res.status(500).render("error", { message: "Server Error" });
    }
};

const placeOrder = async (req, res) => {
    console.log('[CHECKOUT] Placing order for user:', req.session.user._id);
    try {
        const userId = req.session.user._id;
        const { addressId, paymentMethod = 'cod' } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.json({ success: false, message: "User not found." });
        }

        const address = await Address.findById(addressId);
        if (!address) {
            return res.json({ success: false, message: "Address not found." });
        }

        const cart = await Cart.findOne({ user: userId }).populate({
            path: 'items.product',
            select: 'productName variants'
        });

        if (!cart || cart.items.length === 0) {
            return res.json({ success: false, message: "Cart is empty." });
        }

        const orderItems = cart.items.map(item => ({
            product: item.product._id,
            variantIndex: item.variantIndex,
            quantity: item.quantity,
            price: item.product.variants[item.variantIndex].price
        }));

        // Check and update stock before placing order
        for (const item of orderItems) {
            const product = await Product.findById(item.product);
            if (!product || !product.variants[item.variantIndex]) {
                return res.status(400).json({ success: false, message: `Product or variant not found for ${item.product}` });
            }
            if (product.variants[item.variantIndex].stock < item.quantity) {
                return res.status(400).json({ success: false, message: `Insufficient stock for ${product.productName} (${product.variants[item.variantIndex].colorName}).` });
            }
            product.variants[item.variantIndex].stock -= item.quantity;
            await product.save();
            console.log('[CHECKOUT] Stock decreased for product:', product.productName, 'Variant:', item.variantIndex, 'New stock:', product.variants[item.variantIndex].stock);
        }

        const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shippingFee = 100;
        const totalAmount = subtotal + (subtotal * 0.12) + shippingFee; // Dynamic GST calculation

        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = new Wallet({ userId, balance: 0, transactions: [] });
            await wallet.save();
        }

        let paymentStatus = 'Pending';
        if (paymentMethod === 'wallet' && wallet.balance >= totalAmount) {
            paymentStatus = 'Completed';
            wallet.transactions.push({
                type: 'Purchase',
                amount: totalAmount,
                orderId: order._id, // Will be set after order creation
                status: 'Completed',
                description: `Purchase for order #${order.orderNumber}`
            });
            wallet.balance -= totalAmount;
            await wallet.save();
        }

        const order = new Order({
            user: userId,
            items: orderItems,
            shippingAddress: addressId,
            payment: { method: paymentMethod, status: paymentStatus },
            pricing: { subtotal, shippingFee, finalAmount: totalAmount },
            orderStatus: 'Processing'
        });

        // Ensure orderNumber is generated
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
        if (paymentMethod === 'wallet' && paymentStatus === 'Completed') {
            const transaction = wallet.transactions[wallet.transactions.length - 1];
            transaction.orderId = order._id; // Update orderId after save
            await wallet.save();
        }
        await Cart.findOneAndDelete({ user: userId });

        res.json({ success: true, orderId: order._id, orderNumber: order.orderNumber, message: "Order placed successfully!" });
    } catch (error) {
        console.error('[CHECKOUT] Error placing order:', error);
        res.json({ success: false, message: "Server error. Please try again." });
    }
};

const getOrderSuccess = async (req, res) => {
    console.log('[CHECKOUT] Fetching order success page for order:', req.params.orderId);
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
            return res.status(404).render("user/page-404", { message: "Order not found or unauthorized." });
        }

        res.render("user/order-success", { order, user: req.session.user });
    } catch (error) {
        console.error('[CHECKOUT] Error fetching order success page:', error);
        res.status(500).render("error", { message: "Server Error" });
    }
};

module.exports = {
    getCheckout,
    placeOrder,
    getOrderSuccess
};