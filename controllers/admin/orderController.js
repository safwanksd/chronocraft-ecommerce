// controllers/admin/orderController.js

const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const Product = require('../../models/productSchema');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// Retrieves a paginated list of orders with search, sort, and filter options
const getOrders = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        // Builds the query with search criteria
        let query = {};
        if (search) {
            query.$or = [
                { orderNumber: { $regex: search, $options: 'i' } },
                { 'user': await User.findOne({ name: { $regex: search, $options: 'i' } })?._id }
            ];
        }

        // Fetches orders with populated fields and applies sorting and pagination
        const orders = await Order.find(query)
            .populate('user', 'name email')
            .populate('shippingAddress')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        // Retrieves available order status values from the schema
        const orderStatusEnum = Order.schema.path('orderStatus').enumValues;

        res.render('admin/orders', {
            orders,
            currentPage: parseInt(page),
            totalPages,
            totalOrders,
            search,
            limit,
            noResults: orders.length === 0 && search,
            orderStatuses: orderStatusEnum
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error fetching orders:', error);
        // Handles errors with a generic server error response
        res.status(500).send('Server Error');
    }
};

// Updates the status of an existing order
const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Prevents status changes for terminal states
        if (['Cancelled', 'Failed', 'Returned'].includes(order.orderStatus)) {
            return res.status(400).json({
                success: false,
                message: `Cannot change status of an order in ${order.orderStatus} state`
            });
        }

        // Defines allowed status transitions
        const statusHierarchy = {
            'Processing': ['Shipped', 'Cancelled'],
            'Shipped': ['Delivered', 'Cancelled'],
            'Delivered': ['Return Requested'],
            'Return Requested': ['Returned', 'Delivered'],
            'Returned': [],
            'Failed': [],
            'Cancelled': []
        };

        // Validates the status transition
        const allowedNextStatuses = statusHierarchy[order.orderStatus] || [];
        if (!allowedNextStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot change status from ${order.orderStatus} to ${status}. Allowed next statuses: ${allowedNextStatuses.join(', ')}`
            });
        }

        order.orderStatus = status;

        // Updates payment status based on the new order status
        if (status === 'Delivered') {
            if (!order.payment || !order.payment.method) {
                return res.status(400).json({
                    success: false,
                    message: 'Order has no payment method defined'
                });
            }
            const paymentMethod = order.payment.method.toUpperCase();
            if (paymentMethod === 'COD') {
                order.payment.status = 'Completed';
            } else if (paymentMethod === 'RAZORPAY' || paymentMethod === 'WALLET') {
                if (order.payment.status !== 'Completed') {
                    return res.status(400).json({
                        success: false,
                        message: `${paymentMethod} order payment status must be Completed before delivery`
                    });
                }
            } else {
                return res.status(400).json({
                    success: false,
                    message: `Invalid payment method for delivery update: ${order.payment.method}`
                });
            }
        } else if (status === 'Cancelled') {
            order.payment.status = 'Order Cancelled';
        }

        await order.save();

        res.json({
            success: true,
            message: 'Order status updated successfully',
            newStatus: status,
            paymentStatus: order.payment.status,
            returnRequested: order.items.some(item => item.status.return.requested),
            returnStatus: order.items.map(item => item.status.return.status)
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error updating order status:', error);
        // Handles errors with a detailed error message
        res.status(500).json({
            success: false,
            message: `Server error: ${error.message}`
        });
    }
};

// Verifies and processes a return request for an order
const verifyReturnRequest = async (req, res) => {
    try {
        const { returnId } = req.params; // Assumes returnId is the orderId
        const { action } = req.body; // 'approve' or 'reject'

        const order = await Order.findById(returnId).populate('user');
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const returnItem = order.items.find(item => item.status.return.requested);
        if (!returnItem) {
            return res.status(404).json({ success: false, message: 'Return request not found' });
        }

        if (order.orderStatus !== 'Return Requested') {
            return res.status(400).json({ success: false, message: 'Order is not in Return Requested state' });
        }

        let wallet = await Wallet.findOne({ userId: order.user._id });

        if (action === 'approve') {
            returnItem.status.return.status = 'Approved';
            order.orderStatus = 'Returned';

            // Calculates the refund amount for approved items
            const refundAmount = order.items.reduce((sum, item) => {
                return item.status.return.status === 'Approved' ? sum + (item.price * item.quantity) : sum;
            }, 0);

            // Updates the wallet with the refund for COD orders
            if (wallet) {
                const pendingTransaction = wallet.transactions.find(t =>
                    t.type === 'Refund' && t.orderId.toString() === order._id.toString() && t.status === 'Pending'
                );
                if (pendingTransaction) {
                    pendingTransaction.status = 'Completed';
                    pendingTransaction.description = `Refund for order #${order.orderNumber} (approved)`;
                    wallet.balance += refundAmount;
                    await wallet.save();
                }
            }
        } else if (action === 'reject') {
            returnItem.status.return.status = 'Rejected';
            order.orderStatus = 'Delivered';

            // Removes any pending refund transaction
            if (wallet) {
                wallet.transactions = wallet.transactions.filter(t =>
                    !(t.type === 'Refund' && t.orderId.toString() === order._id.toString() && t.status === 'Pending')
                );
                await wallet.save();
            }
        } else {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }

        returnItem.status.return.requested = false;
        await order.save();

        res.json({
            success: true,
            message: `Return request ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
            returnStatus: returnItem.status.return.status,
            orderStatus: order.orderStatus,
            balance: wallet ? wallet.balance : null
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error verifying return request:', error);
        // Handles errors with a generic error message
        res.status(500).json({ success: false, message: 'Failed to verify return request' });
    }
};

// Redirects to the default orders page, clearing any search parameters
const clearSearch = (req, res) => {
    res.redirect('/admin/orders');
};

// Retrieves detailed information for a specific order
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
            return res.status(404).send('Order not found');
        }
        res.render('admin/order-details', { order });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error fetching order details:', error);
        // Handles errors with a generic server error response
        res.status(500).send('Server Error');
    }
};

// Generates a sales report based on the selected timeframe
const getSalesReport = async (req, res) => {
    try {
        const { timeframe = 'yearly', startDate: startDateStr, endDate: endDateStr } = req.query;
        const today = new Date();
        let startDate, endDate;

        // Sets the date range based on the selected timeframe
        switch (timeframe.toLowerCase()) {
            case 'today':
                startDate = new Date(today.setHours(0, 0, 0, 0));
                endDate = new Date(today.setHours(23, 59, 59, 999));
                break;
            case 'weekly':
                startDate = new Date(today.setDate(today.getDate() - 7));
                endDate = new Date();
                break;
            case 'monthly':
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date();
                break;
            case 'custom':
                if (!startDateStr || !endDateStr) {
                    return res.render('admin/sales-report', {
                        timeframe,
                        error: 'Please provide both start and end dates for custom timeframe.',
                        reportData: [],
                        overallTotalOrders: 0,
                        overallTotalRevenue: 0,
                        overallProductsSold: 0,
                        overallAverageOrderValue: 0,
                        overallDiscount: 0,
                        startDate: startDateStr || '',
                        endDate: endDateStr || ''
                    });
                }
                startDate = new Date(startDateStr);
                endDate = new Date(endDateStr);
                if (isNaN(startDate) || isNaN(endDate)) {
                    return res.render('admin/sales-report', {
                        timeframe,
                        error: 'Invalid date format. Please use YYYY-MM-DD.',
                        reportData: [],
                        overallTotalOrders: 0,
                        overallTotalRevenue: 0,
                        overallProductsSold: 0,
                        overallAverageOrderValue: 0,
                        overallDiscount: 0,
                        startDate: startDateStr,
                        endDate: endDateStr
                    });
                }
                if (startDate > endDate) {
                    return res.render('admin/sales-report', {
                        timeframe,
                        error: 'Start date cannot be after end date.',
                        reportData: [],
                        overallTotalOrders: 0,
                        overallTotalRevenue: 0,
                        overallProductsSold: 0,
                        overallAverageOrderValue: 0,
                        overallDiscount: 0,
                        startDate: startDateStr,
                        endDate: endDateStr
                    });
                }
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'yearly':
            default:
                startDate = new Date(today.getFullYear(), 0, 1);
                endDate = new Date();
                break;
        }

        const salesData = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    orderStatus: { $in: ['Delivered', 'Completed'] }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$pricing.finalAmount' },
                    totalProductsSold: { $sum: { $sum: '$items.quantity' } },
                    totalDiscount: { $sum: '$pricing.discount' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const totalRevenue = salesData.reduce((sum, data) => sum + data.totalRevenue, 0);
        const totalOrders = salesData.reduce((sum, data) => sum + data.totalOrders, 0);
        const totalDiscount = salesData.reduce((sum, data) => sum + (data.totalDiscount || 0), 0);
        const totalProductsSold = salesData.reduce((sum, data) => sum + data.totalProductsSold, 0);
        const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        const reportData = salesData.map(data => ({
            date: data._id,
            orders: data.totalOrders,
            productsSold: data.totalProductsSold,
            revenue: data.totalRevenue,
            discount: data.totalDiscount || 0,
            averageOrderValue: data.totalOrders > 0 ? data.totalRevenue / data.totalOrders : 0
        }));

        res.render('admin/sales-report', {
            timeframe,
            reportData,
            overallTotalOrders: totalOrders,
            overallTotalRevenue: totalRevenue,
            overallProductsSold: totalProductsSold,
            overallAverageOrderValue: averageOrderValue,
            overallDiscount: totalDiscount,
            startDate: startDateStr || startDate.toISOString().split('T')[0],
            endDate: endDateStr || endDate.toISOString().split('T')[0],
            error: null
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error generating sales report:', error);
        // Handles errors by rendering the report page with default values and an error message
        res.render('admin/sales-report', {
            timeframe: req.query.timeframe || 'yearly',
            error: 'An error occurred while generating the sales report.',
            reportData: [],
            overallTotalOrders: 0,
            overallTotalRevenue: 0,
            overallProductsSold: 0,
            overallAverageOrderValue: 0,
            overallDiscount: 0,
            startDate: req.query.startDate || '',
            endDate: req.query.endDate || ''
        });
    }
};

// Generates and downloads a PDF version of the sales report
const downloadSalesReportPDF = async (req, res) => {
    try {
        const { timeframe = 'yearly', startDate: startDateStr, endDate: endDateStr } = req.query;
        const today = new Date();
        let startDate, endDate;

        switch (timeframe.toLowerCase()) {
            case 'today':
                startDate = new Date(today.setHours(0, 0, 0, 0));
                endDate = new Date(today.setHours(23, 59, 59, 999));
                break;
            case 'weekly':
                startDate = new Date(today.setDate(today.getDate() - 7));
                endDate = new Date();
                break;
            case 'monthly':
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date();
                break;
            case 'custom':
                if (!startDateStr || !endDateStr) throw new Error('Missing custom dates');
                startDate = new Date(startDateStr);
                endDate = new Date(endDateStr);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'yearly':
            default:
                startDate = new Date(today.getFullYear(), 0, 1);
                endDate = new Date();
                break;
        }

        const salesData = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    orderStatus: { $in: ['Delivered', 'Completed'] }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$pricing.finalAmount' },
                    totalProductsSold: { $sum: { $sum: '$items.quantity' } }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const totalRevenue = salesData.reduce((sum, data) => sum + data.totalRevenue, 0);
        const totalOrders = salesData.reduce((sum, data) => sum + data.totalOrders, 0);
        const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        const totalProductsSold = salesData.reduce((sum, data) => sum + data.totalProductsSold, 0);

        const reportData = salesData.map(data => ({
            date: data._id,
            orders: data.totalOrders,
            productsSold: data.totalProductsSold,
            revenue: data.totalRevenue,
            averageOrderValue: data.totalOrders > 0 ? data.totalRevenue / data.totalOrders : 0
        }));

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=sales-report-${timeframe}-${new Date().toISOString().split('T')[0]}.pdf`);
        doc.pipe(res);

        doc.fontSize(20).text('Sales Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Timeframe: ${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)}`, { align: 'center' });
        if (timeframe === 'custom') {
            doc.text(`From: ${startDateStr} To: ${endDateStr}`, { align: 'center' });
        }
        doc.moveDown();

        doc.fontSize(14).text('Summary', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12)
            .text(`Total Revenue: ₹${totalRevenue.toFixed(2)}`)
            .text(`Total Orders: ${totalOrders}`)
            .text(`Average Order Value: ₹${averageOrderValue.toFixed(2)}`)
            .text(`Products Sold: ${totalProductsSold}`);
        doc.moveDown();

        const tableTop = doc.y;
        const colWidths = [100, 60, 80, 80, 100];
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Date', 50, tableTop)
            .text('Orders', 150, tableTop)
            .text('Products Sold', 210, tableTop)
            .text('Revenue', 290, tableTop)
            .text('Avg Order Value', 370, tableTop);

        let y = tableTop + 20;
        doc.font('Helvetica');
        reportData.forEach(row => {
            doc.text(row.date, 50, y)
                .text(row.orders.toString(), 150, y)
                .text(row.productsSold.toString(), 210, y)
                .text(`₹${row.revenue.toFixed(2)}`, 290, y)
                .text(`₹${row.averageOrderValue.toFixed(2)}`, 370, y);
            y += 20;
        });

        y += 10;
        doc.font('Helvetica-Bold');
        doc.text('Total', 50, y)
            .text(totalOrders.toString(), 150, y)
            .text(totalProductsSold.toString(), 210, y)
            .text(`₹${totalRevenue.toFixed(2)}`, 290, y)
            .text(`₹${averageOrderValue.toFixed(2)}`, 370, y);

        doc.end();
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error generating PDF sales report:', error);
        // Handles errors with a JSON response
        res.status(500).json({ success: false, message: 'Failed to generate PDF report' });
    }
};

// Generates and downloads an Excel version of the sales report
const downloadSalesReportExcel = async (req, res) => {
    try {
        const { timeframe = 'yearly', startDate: startDateStr, endDate: endDateStr } = req.query;
        const today = new Date();
        let startDate, endDate;

        switch (timeframe.toLowerCase()) {
            case 'today':
                startDate = new Date(today.setHours(0, 0, 0, 0));
                endDate = new Date(today.setHours(23, 59, 59, 999));
                break;
            case 'weekly':
                startDate = new Date(today.setDate(today.getDate() - 7));
                endDate = new Date();
                break;
            case 'monthly':
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date();
                break;
            case 'custom':
                if (!startDateStr || !endDateStr) throw new Error('Missing custom dates');
                startDate = new Date(startDateStr);
                endDate = new Date(endDateStr);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'yearly':
            default:
                startDate = new Date(today.getFullYear(), 0, 1);
                endDate = new Date();
                break;
        }

        const salesData = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    orderStatus: { $in: ['Delivered', 'Completed'] }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$pricing.finalAmount' },
                    totalProductsSold: { $sum: { $sum: '$items.quantity' } }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const totalRevenue = salesData.reduce((sum, data) => sum + data.totalRevenue, 0);
        const totalOrders = salesData.reduce((sum, data) => sum + data.totalOrders, 0);
        const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        const totalProductsSold = salesData.reduce((sum, data) => sum + data.totalProductsSold, 0);

        const reportData = salesData.map(data => ({
            date: data._id,
            orders: data.totalOrders,
            productsSold: data.totalProductsSold,
            revenue: data.totalRevenue,
            averageOrderValue: data.totalOrders > 0 ? data.totalRevenue / data.totalOrders : 0
        }));

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        worksheet.addRow([`Sales Report - ${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)}`]);
        if (timeframe === 'custom') {
            worksheet.addRow([`From: ${startDateStr} To: ${endDateStr}`]);
        }
        worksheet.addRow([]);

        worksheet.addRow(['Summary']);
        worksheet.addRow(['Total Revenue', `₹${totalRevenue.toFixed(2)}`]);
        worksheet.addRow(['Total Orders', totalOrders]);
        worksheet.addRow(['Average Order Value', `₹${averageOrderValue.toFixed(2)}`]);
        worksheet.addRow(['Products Sold', totalProductsSold]);
        worksheet.addRow([]);

        worksheet.addRow(['Date', 'Orders', 'Products Sold', 'Revenue', 'Average Order Value']);
        worksheet.getRow(worksheet.lastRow.number).font = { bold: true };

        reportData.forEach(row => {
            worksheet.addRow([
                row.date,
                row.orders,
                row.productsSold,
                `₹${row.revenue.toFixed(2)}`,
                `₹${row.averageOrderValue.toFixed(2)}`
            ]);
        });

        worksheet.addRow([
            'Total',
            totalOrders,
            totalProductsSold,
            `₹${totalRevenue.toFixed(2)}`,
            `₹${averageOrderValue.toFixed(2)}`
        ]);
        worksheet.getRow(worksheet.lastRow.number).font = { bold: true };

        worksheet.columns.forEach(column => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, cell => {
                const columnLength = cell.value ? cell.value.toString().length : 10;
                if (columnLength > maxLength) {
                    maxLength = columnLength;
                }
            });
            column.width = maxLength < 10 ? 10 : maxLength;
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=sales-report-${timeframe}-${new Date().toISOString().split('T')[0]}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error generating Excel sales report:', error);
        // Handles errors with a JSON response
        res.status(500).json({ success: false, message: 'Failed to generate Excel report' });
    }
};

// Retrieves dashboard statistics based on the selected timeframe
const getDashboardStats = async (req, res) => {
    try {
        const { timeframe = 'monthly' } = req.query;
        const today = new Date();
        let startDate, endDate;

        switch (timeframe.toLowerCase()) {
            case 'daily':
                startDate = new Date(today.setHours(0, 0, 0, 0));
                endDate = new Date(today.setHours(23, 59, 59, 999));
                break;
            case 'weekly':
                startDate = new Date(today.setDate(today.getDate() - 7));
                endDate = new Date();
                break;
            case 'monthly':
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date();
                break;
            case 'yearly':
                startDate = new Date(today.getFullYear(), 0, 1);
                endDate = new Date();
                break;
            default:
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date();
                break;
        }

        const totalOrders = await Order.countDocuments({
            createdAt: { $gte: startDate, $lte: endDate },
            orderStatus: { $in: ['Delivered', 'Completed'] }
        });

        const totalRevenueData = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    orderStatus: { $in: ['Delivered', 'Completed'] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$pricing.finalAmount' }
                }
            }
        ]);
        const totalRevenue = totalRevenueData[0]?.totalRevenue || 0;

        const totalProductsSoldData = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    orderStatus: { $in: ['Delivered', 'Completed'] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalProductsSold: { $sum: { $sum: '$items.quantity' } }
                }
            }
        ]);
        const totalProductsSold = totalProductsSoldData[0]?.totalProductsSold || 0;

        const totalUsers = await User.countDocuments();

        let format;
        if (timeframe === 'daily') {
            format = '%Y-%m-%d %H:%M';
        } else if (timeframe === 'weekly' || timeframe === 'monthly') {
            format = '%Y-%m-%d';
        } else {
            format = '%Y-%m';
        }

        const salesData = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    orderStatus: { $in: ['Delivered', 'Completed'] }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format, date: '$createdAt' } },
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$pricing.finalAmount' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const lineChartData = {
            labels: salesData.map(data => data._id),
            orders: salesData.map(data => data.totalOrders),
            revenue: salesData.map(data => data.totalRevenue)
        };

        const topProductsData = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    orderStatus: { $in: ['Delivered', 'Completed'] }
                }
            },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.product',
                    totalSold: { $sum: '$items.quantity' }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $project: {
                    productName: '$product.productName',
                    totalSold: 1
                }
            },
            { $sort: { totalSold: -1 } },
            { $limit: 5 }
        ]);

        const topProductsChartData = {
            labels: topProductsData.length > 0 ? topProductsData.map(data => data.productName) : ['No Data'],
            values: topProductsData.length > 0 ? topProductsData.map(data => data.totalSold) : [0]
        };

        const topCategoriesData = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    orderStatus: { $in: ['Delivered', 'Completed'] }
                }
            },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.category',
                    totalSold: { $sum: '$items.quantity' }
                }
            },
            {
                $lookup: {
                    from: 'categories',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            { $unwind: '$category' },
            {
                $project: {
                    categoryName: '$category.name',
                    totalSold: 1
                }
            },
            { $sort: { totalSold: -1 } },
            { $limit: 5 }
        ]);

        const topCategoriesChartData = {
            labels: topCategoriesData.length > 0 ? topCategoriesData.map(data => data.categoryName) : ['No Data'],
            values: topCategoriesData.length > 0 ? topCategoriesData.map(data => data.totalSold) : [0]
        };

        const topBrandsData = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: endDate },
                    orderStatus: { $in: ['Delivered', 'Completed'] }
                }
            },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.brand',
                    totalSold: { $sum: '$items.quantity' }
                }
            },
            {
                $lookup: {
                    from: 'brands',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'brand'
                }
            },
            { $unwind: '$brand' },
            {
                $project: {
                    brandName: '$brand.brandName',
                    totalSold: 1
                }
            },
            { $sort: { totalSold: -1 } },
            { $limit: 5 }
        ]);

        const topBrandsChartData = {
            labels: topBrandsData.length > 0 ? topBrandsData.map(data => data.brandName) : ['No Data'],
            values: topBrandsData.length > 0 ? topBrandsData.map(data => data.totalSold) : [0]
        };
        res.render('admin/dashboard', {
            totalOrders,
            totalRevenue,
            totalProductsSold,
            totalUsers,
            lineChartData,
            topProductsChartData,
            topCategoriesChartData,
            topBrandsChartData,
            timeframe,
            error: null // Default to null when no error
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).render('admin/dashboard', {
            totalOrders: 0,
            totalRevenue: 0,
            totalProductsSold: 0,
            totalUsers: 0,
            lineChartData: { labels: [], orders: [], revenue: [] },
            topProductsChartData: { labels: [], values: [] },
            topCategoriesChartData: { labels: [], values: [] },
            topBrandsChartData: { labels: [], values: [] },
            timeframe: 'monthly',
            error: 'Failed to load dashboard stats'
        });
    }
};
module.exports = {
    getOrders,
    updateOrderStatus,
    verifyReturnRequest,
    clearSearch,
    getOrderDetails,
    getSalesReport,
    downloadSalesReportPDF,
    downloadSalesReportExcel,
    getDashboardStats
};