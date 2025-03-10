// controllers/user/orderController.js

const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const User = require("../../models/userSchema"); 
const Wallet = require("../../models/walletSchema");
//const pdfkit = require('pdfkit');
const PDFDocument = require("pdfkit");
const fs = require('fs');
const path = require('path');

const getOrders = async (req, res) => {
    console.log('[ORDER] Fetching orders for user:', req.session.user._id);
    console.log('[ORDER] Query params:', req.query); 
    try {
        const page = parseInt(req.query.page) || 1; 
        const limit = 5; // 
        const skip = (page - 1) * limit;

        let query = { user: req.session.user._id };
        const search = req.query.search || ''; 

        if (search) {
            console.log('[ORDER] Processing search with query:', search);
            // Search by orderNumber (case-insensitive)
            const orderNumberQuery = { orderNumber: { $regex: search, $options: 'i' } };
            console.log('[ORDER] Order number query constructed:', orderNumberQuery);

            // Search by product name (find all products matching the search and use their IDs in the query)
            console.log('[ORDER] Searching for products with name:', search);
            const productIds = await Product.find({ productName: { $regex: search, $options: 'i' } }).select('_id');
            console.log('[ORDER] Found product IDs:', productIds.map(p => p._id.toString()));

            const productIdQuery = productIds.length > 0 ? { 'items.product': { $in: productIds.map(p => p._id) } } : null;
            console.log('[ORDER] Product ID query constructed:', productIdQuery);

            // Combine queries if both are applicable
            if (productIdQuery) {
                query = {
                    $and: [
                        { user: req.session.user._id },
                        {
                            $or: [
                                orderNumberQuery,
                                productIdQuery
                            ]
                        }
                    ]
                };
                console.log('[ORDER] Combined query:', query);
            } else {
                query = {
                    $and: [
                        { user: req.session.user._id },
                        orderNumberQuery
                    ]
                };
                console.log('[ORDER] Query with only order number:', query);
            }
        }

        console.log('[ORDER] Final query before find:', query);
        const totalOrders = await Order.countDocuments(query); // Total orders for pagination
        const totalPages = Math.ceil(totalOrders / limit);
        console.log('[ORDER] Total orders:', totalOrders, 'Total pages:', totalPages);

        // Validate page number
        if (page < 1 || (totalOrders === 0 && page > 1)) {
            if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
                return res.status(400).json({ success: false, message: "Invalid page number." });
            }
            return res.status(400).render("error", { message: "Invalid page number." });
        }

        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate({
                path: 'items.product',
                select: 'productName variants'
            })
            .populate('shippingAddress');
        console.log('[ORDER] Orders fetched:', orders.length, 'orders');

        if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
            console.log('[ORDER] Sending AJAX response with orders:', orders.length);
            return res.json({ success: true, orders, currentPage: page, totalPages, search });
        }

        console.log('[ORDER] Rendering orders page with:', orders.length, 'orders');
        res.render("user/orders", { orders, user: req.session.user, currentPage: page, totalPages, totalOrders, search });
    } catch (error) {
        console.error('[ORDER] Error fetching orders - Details:', error.message, error.stack);
        if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
            console.log('[ORDER] Sending AJAX error response');
            return res.status(500).json({ success: false, message: "Server error. Please try again." });
        }
        res.status(500).render("error", { message: "Server Error" });
    }
};

const getOrderDetail = async (req, res) => {
    console.log('[ORDER] Fetching order detail for order:', req.params.orderId);
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
            if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
                return res.status(404).json({ success: false, message: "Order not found or unauthorized." });
            }
            return res.status(404).render("user/page-404", { message: "Order not found or unauthorized." });
        }

        if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
            return res.json({ success: true, order });
        }

        res.render("user/order-detail", { order, user: req.session.user });
    } catch (error) {
        console.error('[ORDER] Error fetching order detail:', error);
        if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
            return res.status(500).json({ success: false, message: "Server error. Please try again." });
        }
        res.status(500).render("error", { message: "Server Error" });
    }
};

const cancelOrder = async (req, res) => {
    console.log('[ORDER] Canceling order:', req.params.orderId);
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId);

        if (!order || order.user._id.toString() !== req.session.user._id) {
            return res.json({ success: false, message: "Order not found or unauthorized." });
        }

        if (order.orderStatus !== 'Processing') {
            return res.json({ success: false, message: "Order cannot be cancelled at this stage." });
        }

        const reason = req.body.reason || ''; // Optional reason
        order.orderStatus = 'Cancelled';
        order.cancelReason = reason;

        // Increase stock for all items in the order (except already cancelled items)
        for (const item of order.items) {
            if (item.status.itemStatus !== 'Cancelled') {
                const product = await Product.findById(item.product);
                if (product && product.variants[item.variantIndex]) {
                    product.variants[item.variantIndex].stock += item.quantity;
                    await product.save();
                    console.log('[ORDER] Stock increased for product:', product.productName, 'Variant:', item.variantIndex, 'New stock:', product.variants[item.variantIndex].stock);
                } else {
                    console.error('[ORDER] Product or variant not found for stock update:', item.product, item.variantIndex);
                    return res.status(500).json({ success: false, message: "Product or variant not found for stock update." });
                }
            }
        }

        await order.save();
        res.json({ success: true, message: "Order cancelled successfully!" });
    } catch (error) {
        console.error('[ORDER] Error canceling order:', error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

const cancelItem = async (req, res) => {
    console.log('[ORDER] Canceling item from order:', req.params.orderId, req.params.itemId);
    try {
        const orderId = req.params.orderId;
        const itemId = req.params.itemId;
        const order = await Order.findById(orderId);

        if (!order || order.user._id.toString() !== req.session.user._id) {
            return res.json({ success: false, message: "Order not found or unauthorized." });
        }

        if (order.orderStatus !== 'Processing') {
            return res.json({ success: false, message: "Item cannot be cancelled at this stage." });
        }

        const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);
        if (itemIndex === -1) {
            return res.json({ success: false, message: "Item not found in order." });
        }

        const reason = req.body.reason || ''; // Optional reason
        order.items[itemIndex].status.itemStatus = 'Cancelled';
        order.cancelReason = reason || order.cancelReason; // Append or update reason

        // Increase stock for the cancelled item
        const item = order.items[itemIndex];
        const product = await Product.findById(item.product);
        if (product && product.variants[item.variantIndex]) {
            product.variants[item.variantIndex].stock += item.quantity;
            await product.save();
            console.log('[ORDER] Stock increased for product:', product.productName, 'Variant:', item.variantIndex, 'New stock:', product.variants[item.variantIndex].stock);
        } else {
            console.error('[ORDER] Product or variant not found for stock update:', item.product, item.variantIndex);
            return res.status(500).json({ success: false, message: "Product or variant not found for stock update." });
        }

        // Update pricing (remove cancelled item's cost)
        order.pricing.subtotal -= (order.items[itemIndex].price * order.items[itemIndex].quantity);
        order.pricing.finalAmount = order.pricing.subtotal + order.pricing.shippingFee;
        await order.save();

        res.json({ success: true, message: "Item cancelled successfully!" });
    } catch (error) {
        console.error('[ORDER] Error canceling item:', error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

const returnOrder = async (req, res) => {
    console.log('[ORDER] Returning order:', req.params.orderId);
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId);

        if (!order || order.user._id.toString() !== req.session.user._id) {
            return res.json({ success: false, message: "Order not found or unauthorized." });
        }

        if (order.orderStatus !== 'Delivered') {
            return res.json({ success: false, message: "Order can only be returned after delivery." });
        }

        const reason = req.body.reason;
        if (!reason) {
            return res.json({ success: false, message: "Reason for return is required." });
        }

        // Change status to 'Return Requested'
        order.orderStatus = 'Return Requested';
        let totalRefundAmount = 0;
        for (const item of order.items) {
            item.status.return.requested = true;
            item.status.return.status = 'Pending';
            item.status.return.reason = reason;
            item.status.return.requestDate = new Date();

            // Increase stock for returned items
            const product = await Product.findById(item.product);
            if (product && product.variants[item.variantIndex]) {
                product.variants[item.variantIndex].stock += item.quantity;
                await product.save();
                console.log('[ORDER] Stock increased for product:', product.productName, 'Variant:', item.variantIndex, 'New stock:', product.variants[item.variantIndex].stock);
                totalRefundAmount += item.price * item.quantity; // Calculate refund amount
            } else {
                console.error('[ORDER] Product or variant not found for stock update:', item.product, item.variantIndex);
                return res.status(500).json({ success: false, message: "Product or variant not found for stock update." });
            }
        }
        await order.save();

        // Add pending refund transaction to wallet
        const wallet = await Wallet.findOne({ userId: order.user._id });
        if (wallet) {
            wallet.transactions.push({
                type: 'Refund',
                amount: totalRefundAmount,
                orderId: order._id,
                status: 'Pending',
                description: `Refund for order #${order.orderNumber} (pending approval)`
            });
            await wallet.save();
        }

        res.json({ success: true, message: "Return request submitted successfully!" });
    } catch (error) {
        console.error('[ORDER] Error returning order:', error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

const returnItem = async (req, res) => {
    console.log('[ORDER] Returning item from order:', req.params.orderId, req.params.itemId);
    try {
        const orderId = req.params.orderId;
        const itemId = req.params.itemId;
        const order = await Order.findById(orderId);

        if (!order || order.user._id.toString() !== req.session.user._id) {
            return res.json({ success: false, message: "Order not found or unauthorized." });
        }

        if (order.orderStatus !== 'Delivered') {
            return res.json({ success: false, message: "Item can only be returned after delivery." });
        }

        const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);
        if (itemIndex === -1) {
            return res.json({ success: false, message: "Item not found in order." });
        }

        const reason = req.body.reason;
        if (!reason) {
            return res.json({ success: false, message: "Reason for return is required." });
        }

        const item = order.items[itemIndex];
        item.status.return.requested = true;
        item.status.return.status = 'Pending';
        item.status.return.reason = reason;
        item.status.return.requestDate = new Date();

        // Increase stock for the returned item
        const product = await Product.findById(item.product);
        let refundAmount = 0;
        if (product && product.variants[item.variantIndex]) {
            product.variants[item.variantIndex].stock += item.quantity;
            await product.save();
            console.log('[ORDER] Stock increased for product:', product.productName, 'Variant:', item.variantIndex, 'New stock:', product.variants[item.variantIndex].stock);
            refundAmount = item.price * item.quantity; // Calculate refund amount for this item
        } else {
            console.error('[ORDER] Product or variant not found for stock update:', item.product, item.variantIndex);
            return res.status(500).json({ success: false, message: "Product or variant not found for stock update." });
        }

        await order.save();

        // Add pending refund transaction to wallet
        const wallet = await Wallet.findOne({ userId: order.user._id });
        if (wallet) {
            wallet.transactions.push({
                type: 'Refund',
                amount: refundAmount,
                orderId: order._id,
                status: 'Pending',
                description: `Refund for item #${itemId} in order #${order.orderNumber} (pending approval)`
            });
            await wallet.save();
        }

        // Update order status to 'Return Requested' if any item is returned
        if (!order.orderStatus.includes('Return')) {
            order.orderStatus = 'Return Requested';
            await order.save();
        }

        res.json({ success: true, message: "Return request for item submitted successfully!" });
    } catch (error) {
        console.error('[ORDER] Error returning item:', error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};


const downloadInvoice = async (req, res) => {
    console.log('[ORDER] Generating invoice for order:', req.params.orderId);
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
            return res.status(404).json({ success: false, message: "Order not found or unauthorized." });
        }

        if (order.payment.status !== 'Completed') {
            return res.status(403).json({ success: false, message: "Invoice can only be downloaded after payment is completed." });
        }

        const invoicesDir = path.join(__dirname, '../../public/invoices');
        if (!fs.existsSync(invoicesDir)) {
            fs.mkdirSync(invoicesDir, { recursive: true });
        }

        const invoicePath = path.join(invoicesDir, `${order.orderNumber}.pdf`);
        if (fs.existsSync(invoicePath)) {
            fs.unlinkSync(invoicePath);
        }

        const doc = new PDFDocument({ margin: 50 });
        const writeStream = fs.createWriteStream(invoicePath);
        doc.pipe(writeStream);

        // Generate a random 6-digit invoice number
        const randomInvoiceNumber = `INV-${Math.floor(100000 + Math.random() * 900000)}`;

        // Header
        doc.fillColor('#000000')
            .fontSize(20)
            .text('ChronoCraft', 0, 30, { align: 'center' })
            .moveDown(1);

        // Invoice Information (right-aligned)
        doc.fontSize(10)
            .text(`Invoice #: ${randomInvoiceNumber}`, 400, 60)
            .text(`Order #: ${order.orderNumber}`, 400, 75)
            .text(`Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, 400, 90);

        // Bill To and Shipping Address (two columns)
        doc.fontSize(12).font('Helvetica-Bold').text('Bill To:', 50, 130);
        doc.fontSize(10).font('Helvetica')
            .text(order.user.name, 50, 150)
            .text(order.user.email, 50, 165)
            .text(`Payment Status: ${order.payment.status}`, 50, 180)
            .text(`Payment Method: ${order.payment.method.toUpperCase()}`, 50, 195);

        doc.fontSize(12).font('Helvetica-Bold').text('Shipping Address:', 300, 130);
        doc.fontSize(10).font('Helvetica')
            .text(order.shippingAddress.street, 300, 150)
            .text(`${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`, 300, 165)
            .text(`Phone: ${order.user.phone || 'N/A'}`, 300, 180);

        // Order Items Table
        const tableTop = 230;
        const tableLeft = 50;
        const tableWidth = 500;
        const tableRowHeight = 30;
        const columnWidths = { description: 300, quantity: 50, unitPrice: 50, total: 100 };
        const columnPositions = {
            description: tableLeft,
            quantity: tableLeft + columnWidths.description,
            unitPrice: tableLeft + columnWidths.description + columnWidths.quantity,
            total: tableLeft + columnWidths.description + columnWidths.quantity + columnWidths.unitPrice
        };

        // Draw table headers
        doc.fontSize(12).font('Helvetica-Bold')
            .text('Item Description', columnPositions.description, tableTop, { width: columnWidths.description })
            .text('Quantity', columnPositions.quantity, tableTop, { width: columnWidths.quantity, align: 'right' })
            .text('Unit Price', columnPositions.unitPrice, tableTop, { width: columnWidths.unitPrice, align: 'right' })
            .text('Total', columnPositions.total, tableTop, { width: columnWidths.total, align: 'right' });

        // Draw table borders (header row)
        doc.lineWidth(1)
            .moveTo(tableLeft, tableTop - 5)
            .lineTo(tableLeft + tableWidth, tableTop - 5)
            .stroke();
        doc.moveTo(tableLeft, tableTop + tableRowHeight)
            .lineTo(tableLeft + tableWidth, tableTop + tableRowHeight)
            .stroke();
        doc.moveTo(tableLeft, tableTop - 5)
            .lineTo(tableLeft, tableTop + tableRowHeight)
            .stroke();
        doc.moveTo(tableLeft + columnWidths.description, tableTop - 5)
            .lineTo(tableLeft + columnWidths.description, tableTop + tableRowHeight)
            .stroke();
        doc.moveTo(tableLeft + columnWidths.description + columnWidths.quantity, tableTop - 5)
            .lineTo(tableLeft + columnWidths.description + columnWidths.quantity, tableTop + tableRowHeight)
            .stroke();
        doc.moveTo(tableLeft + tableWidth, tableTop - 5)
            .lineTo(tableLeft + tableWidth, tableTop + tableRowHeight)
            .stroke();

        // Draw item rows
        let itemY = tableTop + tableRowHeight;
        order.items.forEach((item, index) => {
            const itemTotal = item.price * item.quantity;
            doc.fontSize(10).font('Helvetica')
                .text(`${item.product.productName} (Color: ${item.product.variants[item.variantIndex].colorName})`, columnPositions.description, itemY, { width: columnWidths.description, ellipsis: true })
                .text(item.quantity.toString(), columnPositions.quantity, itemY, { width: columnWidths.quantity, align: 'right' })
                .text(`Rs. ${item.price.toLocaleString('en-IN')}`, columnPositions.unitPrice, itemY, { width: columnWidths.unitPrice, align: 'right' })
                .text(`Rs. ${itemTotal.toLocaleString('en-IN')}`, columnPositions.total, itemY, { width: columnWidths.total, align: 'right' });

            // Draw row borders
            doc.moveTo(tableLeft, itemY + tableRowHeight)
                .lineTo(tableLeft + tableWidth, itemY + tableRowHeight)
                .stroke();
            doc.moveTo(tableLeft, itemY)
                .lineTo(tableLeft, itemY + tableRowHeight)
                .stroke();
            doc.moveTo(tableLeft + columnWidths.description, itemY)
                .lineTo(tableLeft + columnWidths.description, itemY + tableRowHeight)
                .stroke();
            doc.moveTo(tableLeft + columnWidths.description + columnWidths.quantity, itemY)
                .lineTo(tableLeft + columnWidths.description + columnWidths.quantity, itemY + tableRowHeight)
                .stroke();
            doc.moveTo(tableLeft + tableWidth, itemY)
                .lineTo(tableLeft + tableWidth, itemY + tableRowHeight)
                .stroke();

            itemY += tableRowHeight;
        });

        // Price Details (right-aligned with more spacing)
        const priceY = itemY + 50;
        doc.fontSize(10).font('Helvetica')
            .text('Subtotal:', 350, priceY, { align: 'left' })
            .text(`Rs. ${order.pricing.subtotal.toLocaleString('en-IN')}`, 450, priceY, { align: 'right' })
            .text('GST (12%):', 350, priceY + 25, { align: 'left' })
            .text(`Rs. ${(order.pricing.subtotal * 0.12).toLocaleString('en-IN')}`, 450, priceY + 25, { align: 'right' })
            .text('Shipping Fee:', 350, priceY + 50, { align: 'left' })
            .text(`Rs. ${order.pricing.shippingFee.toLocaleString('en-IN')}`, 450, priceY + 50, { align: 'right' })
            .text('Total Amount:', 350, priceY + 75, { align: 'left' })
            .font('Helvetica-Bold')
            .text(`Rs. ${order.pricing.finalAmount.toLocaleString('en-IN')}`, 450, priceY + 75, { align: 'right' });

        // Footer
        doc.fontSize(10).font('Helvetica')
            .text('Thank you for your business!', 0, priceY + 120, { align: 'center' })
            .text('Questions? Contact us at support@chronocraft.com', 0, priceY + 135, { align: 'center' });

        // Ensure the document is fully written
        doc.end();
        await new Promise((resolve) => {
            writeStream.on('finish', () => {
                console.log('[ORDER] PDF generation completed for:', invoicePath);
                resolve();
            });
        });

        // Download the file
        res.download(invoicePath, `${order.orderNumber}.pdf`, (err) => {
            if (err) {
                console.error('[ORDER] Error downloading invoice:', err);
                res.status(500).json({ success: false, message: "Failed to download invoice." });
            }
        });
    } catch (error) {
        console.error('[ORDER] Error generating invoice:', error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

module.exports = {
    getOrders,
    getOrderDetail,
    cancelOrder,
    cancelItem,
    returnOrder,
    returnItem,
    downloadInvoice
};