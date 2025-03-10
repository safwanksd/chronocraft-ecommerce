// admin/orderController.js
const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Wallet = require("../../models/walletSchema");

// Get Orders (List in descending order by order date with pagination, search, sort, filter)
const getOrders = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        // Build query (only search remains)
        let query = {};
        if (search) {
            query.$or = [
                { orderNumber: { $regex: search, $options: 'i' } },
                { 'user': await User.findOne({ name: { $regex: search, $options: 'i' } })?._id }
            ];
        }

        // Fetch orders with pagination and sort by createdAt (descending)
        const orders = await Order.find(query)
            .populate('user', 'name email')
            .populate('shippingAddress')
            .sort({ createdAt: -1 }) // Default sort by date (newest first)
            .skip(skip)
            .limit(limit);

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        // Get orderStatus enum values from the schema (unchanged)
        const orderStatusEnum = Order.schema.path('orderStatus').enumValues;

        console.log(`📋 Fetched ${orders.length} orders for page ${page}, total: ${totalOrders}`);

        res.render('admin/orders', {
            orders,
            currentPage: parseInt(page),
            totalPages,
            totalOrders,
            search,
            limit,
            noResults: orders.length === 0 && search, // Flag for no results
            orderStatuses: orderStatusEnum // Pass enum values to template
        });
    } catch (error) {
        console.error("❌ Error fetching orders:", error);
        res.status(500).send("Server Error");
    }
};

// Update Order Status
const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        console.log(`Attempting to update order #${orderId} status to ${status}`);
        console.log(`Received request body: ${JSON.stringify(req.body)}`);

        const order = await Order.findById(orderId);
        if (!order) {
            console.error(`Order not found for ID: ${orderId}`);
            return res.status(404).json({ 
                success: false, 
                message: "Order not found" 
            });
        }

        // Check if the order is already cancelled—prevent status changes
        if (order.orderStatus === 'Cancelled') {
            console.log(`Order #${order.orderNumber} is already cancelled`);
            return res.status(400).json({ 
                success: false, 
                message: "Cannot change status of a cancelled order" 
            });
        }

        // Prevent reverting to "Processing" if status is already "Delivered," "Cancelled," "Failed," or "Returned"
        if (status === 'Processing' && ['Delivered', 'Cancelled', 'Failed', 'Returned'].includes(order.orderStatus)) {
            console.log(`Cannot revert order #${order.orderNumber} to Processing from ${order.orderStatus}`);
            return res.status(400).json({ 
                success: false, 
                message: "Cannot revert to Processing after this status" 
            });
        }

        order.orderStatus = status;
        
        // Update payment status based on order status for COD orders
        if (status === 'Delivered') {
            if (order.payment.method !== 'cod') { 
                console.error(`Unexpected payment method for order #${order.orderNumber}: ${order.payment.method}`);
                return res.status(400).json({ 
                    success: false, 
                    message: "Invalid payment method for delivery update" 
                });
            }
            order.payment.status = 'Completed';
            console.log(`Updated payment status to Completed for COD order #${order.orderNumber}`);
        } else if (status === 'Cancelled') {
            order.payment.status = 'Order Cancelled';
        }

        await order.save();
        console.log(`🔄 Successfully updated order #${order.orderNumber} status to ${status}`);

        res.json({ 
            success: true, 
            message: "Order status updated successfully", 
            newStatus: status,
            paymentStatus: order.payment.status, // Include payment status for delivery or cancellation
            returnRequested: order.items.some(item => item.status.return.requested), // Check if return is requested
            returnStatus: order.items.map(item => item.status.return.status) // Return statuses for each item
        });
    } catch (error) {
        console.error("❌ Error updating order status:", error);
        res.status(500).json({ 
            success: false, 
            message: `Server error: ${error.message}` 
        });
    }
};

// Verify Return Request
const verifyReturnRequest = async (req, res) => {
    try {
        const { returnId } = req.params; // Assuming returnId is the orderId
        const { action } = req.body; // 'approve' or 'reject'

        const order = await Order.findById(returnId).populate('user');
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const returnItem = order.items.find(item => item.status.return.requested);
        if (!returnItem) {
            return res.status(404).json({ success: false, message: "Return request not found" });
        }

        if (action === 'approve') {
            returnItem.status.return.status = 'Approved';
            order.orderStatus = 'Returned'; // Update order status to 'Returned' on approval

            // Calculate refund amount for the returned item(s)
            const refundAmount = order.items.reduce((sum, item) => {
                return item.status.return.status === 'Approved' ? sum + (item.price * item.quantity) : sum;
            }, 0);

            // Update wallet with refund (for COD orders)
            const wallet = await Wallet.findOne({ userId: order.user._id });
            if (wallet) {
                const pendingTransaction = wallet.transactions.find(t => 
                    t.type === 'Refund' && t.orderId.toString() === order._id.toString() && t.status === 'Pending'
                );
                if (pendingTransaction) {
                    pendingTransaction.status = 'Completed';
                    pendingTransaction.description = `Refund for order #${order.orderNumber} (approved)`;
                    wallet.balance += refundAmount;
                    await wallet.save();
                    console.log(`🛒 Refund of ₹${refundAmount} credited to wallet for order #${order.orderNumber}`);
                }
            }
        } else if (action === 'reject') {
            returnItem.status.return.status = 'Rejected';
            // Remove pending refund transaction on rejection
            const wallet = await Wallet.findOne({ userId: order.user._id });
            if (wallet) {
                wallet.transactions = wallet.transactions.filter(t => 
                    !(t.type === 'Refund' && t.orderId.toString() === order._id.toString() && t.status === 'Pending')
                );
                await wallet.save();
                console.log(`🛒 Pending refund removed for order #${order.orderNumber} on rejection`);
            }
        }

        returnItem.status.return.requested = false; // Mark return request as handled
        await order.save();

        console.log(`🔄 Return request for order #${order.orderNumber} ${action === 'approve' ? 'approved' : 'rejected'}`);
        res.json({ 
            success: true, 
            message: `Return request ${action === 'approve' ? 'approved' : 'rejected'} successfully`, 
            returnStatus: returnItem.status.return.status,
            orderStatus: order.orderStatus,
            balance: wallet ? wallet.balance : null // Return updated balance if wallet exists
        });
    } catch (error) {
        console.error("❌ Error verifying return request:", error);
        res.status(500).json({ success: false, message: "Failed to verify return request" });
    }
};

// Clear Search (Redirect to default orders page)
const clearSearch = (req, res) => {
    res.redirect('/admin/orders');
};

// Get Order Details
const getOrderDetails = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId)
            .populate('user', 'name email')
            .populate('shippingAddress')
            .populate({
                path: 'items.product',
                populate: { path: 'variants' }
            });
        if (!order) {
            return res.status(404).send("Order not found");
        }
        console.log(`📋 Fetched details for order #${order.orderNumber}`);
        res.render('admin/order-details', { order });
    } catch (error) {
        console.error("❌ Error fetching order details:", error);
        res.status(500).send("Server Error");
    }
};

module.exports = { 
    getOrders, 
    updateOrderStatus, 
    verifyReturnRequest, 
    clearSearch, 
    getOrderDetails
 };