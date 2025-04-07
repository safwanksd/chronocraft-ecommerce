// controllers/user/countController.js

const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema');

// Retrieves the count of items in the user's cart and wishlist
const getCounts = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in.", redirect: "/user/login" });
        }

        let cartCount = 0;
        let wishlistCount = 0;

        // Fetch cart count
        const cart = await Cart.findOne({ user: req.session.user._id });
        if (cart) {
            cartCount = cart.items.length;
        }

        // Fetch wishlist count (excluding blocked/unlisted products)
        const wishlistItems = await Wishlist.find({ userId: req.session.user._id })
            .populate({
                path: 'product',
                populate: [
                    { path: 'category', select: 'isListed' },
                    { path: 'brand', select: 'isBlocked' }
                ]
            });

        wishlistCount = wishlistItems.filter(item => {
            const product = item.product;
            return !product.isBlocked && product.category.isListed && !product.brand.isBlocked;
        }).length;

        res.json({ success: true, cartCount, wishlistCount });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('[COUNT] Error fetching counts:', error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

module.exports = { getCounts };