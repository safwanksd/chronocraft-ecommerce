// controllers/user/walletController.js

const Wallet = require("../../models/walletSchema");
const User = require("../../models/userSchema");

// Renders the wallet page with transaction history and totals
const loadWallet = async (req, res) => {
    try {
        const userId = req.session.user._id;
        let wallet = await Wallet.findOne({ userId });

        // Create wallet if it doesn't exist
        if (!wallet) {
            wallet = new Wallet({ userId, balance: 0, transactions: [] });
            await wallet.save();
        }

        // Calculate totals
        const totalAdded = wallet.transactions
            .filter(t => t.type === 'Deposit' && t.status === 'Completed')
            .reduce((sum, t) => sum + t.amount, 0);
        const totalSpent = wallet.transactions
            .filter(t => t.type === 'Purchase' && t.status === 'Completed')
            .reduce((sum, t) => sum + t.amount, 0);
        const transactionCount = wallet.transactions.length;

        res.render("user/wallet", {
            user: req.session.user,
            wallet,
            totalAdded,
            totalSpent,
            transactionCount
        });
    } catch (error) {
        console.error("[WALLET] Error loading wallet:", error);
        res.status(500).render("error", { message: "Server Error" });
    }
};

// Adds money to the user's wallet
const addMoney = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { amount } = req.body;

        if (!amount || isNaN(amount) || amount <= 0) {
            return res.json({ success: false, message: "Invalid amount." });
        }

        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = new Wallet({ userId, balance: 0, transactions: [] });
        }

        // Add transaction
        wallet.transactions.push({
            type: 'Deposit',
            amount: parseFloat(amount),
            status: 'Completed',
            description: `Added ₹${amount} to wallet`
        });
        wallet.balance += parseFloat(amount);
        await wallet.save();

        res.json({ success: true, message: "Money added successfully!", balance: wallet.balance });
    } catch (error) {
        console.error("[WALLET] Error adding money:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

module.exports = {
    loadWallet,
    addMoney
};