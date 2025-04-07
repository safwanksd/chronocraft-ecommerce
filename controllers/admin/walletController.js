// controllers/admin/walletController.js

const Wallet = require('../../models/walletSchema');
const User = require('../../models/userSchema');

// Fetches and lists wallet transactions with pagination and sorting
const getWalletTransactions = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10; // 10 transactions per page as specified
        const skip = (page - 1) * limit;
        const sortField = req.query.sort || 'date'; // Default sort by date
        const sortOrder = req.query.order === 'asc' ? 1 : -1; // Default descending

        // Aggregates transactions and joins with user details
        const transactions = await Wallet.aggregate([
            { $unwind: '$transactions' },
            { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'userDetails' } },
            { $unwind: '$userDetails' },
            {
                $project: {
                    transactionId: { $toString: '$transactions._id' },
                    date: '$transactions.date',
                    user: '$userDetails.name',
                    type: '$transactions.type',
                    amount: '$transactions.amount',
                    status: '$transactions.status'
                }
            },
            { $sort: { [sortField]: sortOrder } },
            { $skip: skip },
            { $limit: limit }
        ]);

        const totalTransactions = await Wallet.aggregate([
            { $unwind: '$transactions' },
            { $count: 'total' }
        ]);

        const total = totalTransactions.length > 0 ? totalTransactions[0].total : 0;
        const totalPages = Math.ceil(total / limit);

        // Renders the wallet page with transaction data
        res.render('admin/wallet', {
            transactions,
            currentPage: page,
            totalPages,
            totalTransactions: total,
            sortField,
            sortOrder: sortOrder === 1 ? 'asc' : 'desc',
            limit,
            error: null
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error fetching wallet transactions:', error);
        res.status(500).render('admin/wallet', {
            transactions: [],
            currentPage: 1,
            totalPages: 0,
            totalTransactions: 0,
            sortField: 'date',
            sortOrder: 'desc',
            limit: 10,
            error: 'Failed to load transactions'
        });
    }
};

// Fetches detailed view of a specific transaction
const getTransactionDetails = async (req, res) => {
    try {
        const { transactionId } = req.params;

        // Validates the transaction ID
        if (!transactionId) {
            return res.status(400).render('admin/wallet-details', {
                transaction: null,
                user: null,
                error: 'Invalid transaction ID'
            });
        }

        // Fetches wallet with the specific transaction and populates user details
        const wallet = await Wallet.findOne({ 'transactions._id': transactionId })
            .populate('userId', 'name email phone')
            .lean();

        // Checks if wallet or transaction exists
        if (!wallet) {
            return res.status(404).render('admin/wallet-details', {
                transaction: null,
                user: null,
                error: 'Transaction not found'
            });
        }

        const transaction = wallet.transactions.find(t => t._id.toString() === transactionId);
        if (!transaction) {
            return res.status(404).render('admin/wallet-details', {
                transaction: null,
                user: null,
                error: 'Transaction not found in wallet'
            });
        }

        // Determines if the transaction is related to an order
        const isOrderRelated = transaction.source && transaction.source.orderId;

        // Renders the transaction details page
        res.render('admin/wallet-details', {
            transaction,
            user: wallet.userId,
            isOrderRelated: isOrderRelated || false,
            orderId: isOrderRelated ? transaction.source.orderId : null,
            error: null
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error fetching transaction details:', error);
        res.status(500).render('admin/wallet-details', {
            transaction: null,
            user: null,
            isOrderRelated: false,
            orderId: null,
            error: 'Failed to load transaction details'
        });
    }
};

module.exports = {
    getWalletTransactions,
    getTransactionDetails
};