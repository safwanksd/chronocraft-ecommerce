// middlewares/countMiddleware.js

const Cart = require('../models/cartSchema');
const Wishlist = require('../models/wishlistSchema');

const setHeaderCounts = async (req, res, next) => {
    try {
        let cartCount = 0;
        let wishlistCount = 0;

        if (req.session.user) {
            // Fetch cart count
            const cart = await Cart.findOne({ user: req.session.user._id });
            if (cart) {
                cartCount = cart.items.length; // Number of unique items in the cart
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
        }

        // Set counts in res.locals
        res.locals.cartCount = cartCount;
        res.locals.wishlistCount = wishlistCount;
        next();
    } catch (error) {
        console.error('[COUNT-MIDDLEWARE] Error fetching counts:', error);
        res.locals.cartCount = 0;
        res.locals.wishlistCount = 0;
        next();
    }
};

module.exports = setHeaderCounts;