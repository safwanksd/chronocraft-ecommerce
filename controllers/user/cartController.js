// controllers/user/cartController.js

const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");

// Retrieves the user's cart with pagination support
const getCart = async (req, res) => {
    try {
        if (!req.session.user) {
            if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
                return res.status(401).json({ success: false, message: "Unauthorized. Please log in.", redirect: "/user/login" });
            }
            return res.redirect("/user/login");
        }

        const page = parseInt(req.query.page) || 1; // Default to page 1
        const limit = parseInt(req.query.limit) || 5; // Default to 5 items per page
        const skip = (page - 1) * limit;

        const cart = await Cart.findOne({ user: req.session.user._id })
            .populate({
                path: 'items.product',
                populate: [
                    { path: 'category', select: 'name isListed' },
                    { path: 'brand', select: 'isBlocked' }
                ]
            });

        if (!cart) {
            if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
                return res.json({ success: true, cart: { items: [], totalAmount: 0 }, totalItems: 0, currentPage: page, hasMore: false });
            }
            return res.render("user/cart", { cart: { items: [], totalAmount: 0 }, totalItems: 0, currentPage: page, hasMore: false });
        }

        // Filtering blocked/unlisted products
        cart.items = cart.items.filter(item => {
            const product = item.product;
            return !product.isBlocked && product.category.isListed && !product.brand.isBlocked;
        });

        // Add originalPrice and effectiveDiscount for display purposes
        for (let item of cart.items) {
            const variant = item.product.variants[item.variantIndex];
            item.originalPrice = variant.price;
            item.salePrice = item.salePrice || variant.salePrice;
            item.effectiveDiscount = variant.price > variant.salePrice ? Math.round(((variant.price - variant.salePrice) / variant.price) * 100) : 0;
        }

        // Recalculate totalAmount using salePrice
        cart.totalAmount = cart.items.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
        await cart.save();

        // Pagination logic: Slice the items array based on page and limit
        const totalItems = cart.items.length;
        const paginatedItems = cart.items.slice(skip, skip + limit);
        const hasMore = skip + limit < totalItems;

        const paginatedCart = {
            ...cart.toObject(),
            items: paginatedItems,
        };

        if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
            return res.json({ success: true, cart: paginatedCart, totalItems, currentPage: page, hasMore });
        }

        res.render("user/cart", { cart: paginatedCart, totalItems, currentPage: page, hasMore });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('[CART] Error fetching cart:', error);
        if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
            return res.status(500).json({ success: false, message: "Server error. Please try again." });
        }
        res.status(500).render("error", { message: "Server Error" });
    }
};

// Adds a product variant to the user's cart
const addToCart = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in.", redirect: "/user/login" });
        }

        const { productId, variantIndex } = req.body;
        const userId = req.session.user._id;

        // Check if product, category, and brand are valid (not blocked/unlisted)
        const product = await Product.findOne({ _id: productId, isBlocked: false })
            .populate("category", "isListed")
            .populate("brand", "isBlocked");

        if (!product || !product.category.isListed || product.brand.isBlocked) {
            return res.json({ success: false, message: "Product is not available or blocked." });
        }

        const variant = product.variants[variantIndex];
        if (!variant || variant.stock <= 0) {
            return res.json({ success: false, message: "Product is out of stock." });
        }

        let cart = await Cart.findOne({ user: userId });
        if (!cart) {
            cart = new Cart({ user: userId, items: [], totalAmount: 0 });
        }

        // Check if product variant is already in cart
        const existingItemIndex = cart.items.findIndex(item => 
            item.product.toString() === productId && item.variantIndex === variantIndex
        );

        if (existingItemIndex !== -1) {
            const existingItem = cart.items[existingItemIndex];
            if (existingItem.quantity >= 5) {
                return res.json({ success: false, message: "Maximum quantity (5) reached for this variant." });
            }
            if (existingItem.quantity >= variant.stock) {
                return res.json({ success: false, message: "Not enough stock available." });
            }
            cart.items[existingItemIndex].quantity += 1;
        } else {
            if (variant.stock < 1) {
                return res.json({ success: false, message: "Product is out of stock." });
            }
            cart.items.push({ 
                product: productId, 
                variantIndex, 
                quantity: 1, 
                salePrice: variant.salePrice
            });
        }

        // Recalculate totalAmount using salePrice
        cart.totalAmount = cart.items.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
        await cart.save();

        res.json({ success: true, message: "Product added to cart successfully!" });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('[CART] Error adding to cart:', error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

// Updates the quantity of an item in the cart (increment/decrement)
const updateQuantity = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { action } = req.body;
        const userId = req.session.user._id;

        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in.", redirect: "/user/login" });
        }

        const cart = await Cart.findOne({ user: userId })
            .populate('items.product');

        if (!cart) {
            return res.json({ success: false, message: "Cart not found." });
        }

        const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
        if (itemIndex === -1) {
            return res.json({ success: false, message: "Item not found in cart." });
        }

        const item = cart.items[itemIndex];
        const product = item.product;
        const variant = product.variants[item.variantIndex];

        let message = "";
        if (action === "increment") {
            if (item.quantity >= 5) {
                message = "Maximum quantity (5) reached for this variant.";
            } else if (item.quantity >= variant.stock) {
                message = "Not enough stock available.";
            }
            if (message) {
                return res.json({ success: false, message });
            }
            item.quantity += 1;
        } else if (action === "decrement") {
            if (item.quantity <= 1) {
                message = "Quantity cannot be less than 1.";
                return res.json({ success: false, message });
            }
            item.quantity -= 1;
        }

        // Recalculate totalAmount using salePrice
        cart.totalAmount = cart.items.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
        await cart.save();

        res.json({ 
            success: true, 
            message: "Quantity updated successfully!", 
            newQuantity: item.quantity,
            newTotal: cart.totalAmount,
            pricePerUnit: item.salePrice
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('[CART] Error updating quantity:', error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

// Removes an item from the user's cart
const removeFromCart = async (req, res) => {
    try {
        const { itemId } = req.params;
        const userId = req.session.user._id;

        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in.", redirect: "/user/login" });
        }

        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.json({ success: false, message: "Cart not found." });
        }

        const initialLength = cart.items.length;
        cart.items = cart.items.filter(item => item._id.toString() !== itemId);
        if (cart.items.length === initialLength) {
            return res.json({ success: false, message: "Item not found in cart." });
        }

        // Recalculate totalAmount using salePrice
        cart.totalAmount = cart.items.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
        await cart.save();

        res.json({ success: true, message: "Item removed from cart successfully!", newTotal: cart.totalAmount });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('[CART] Error removing item:', error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

// Checks if a product variant is in the user's cart
const checkCartStatus = async (req, res) => {
    try {
        // Ensure the user is authenticated
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in.", redirect: "/user/login" });
        }

        const { productId, variantIndex } = req.query;
        const userId = req.session.user._id;

        // Validate query parameters
        if (!productId || variantIndex === undefined) {
            return res.status(400).json({ success: false, message: "Product ID and variant index are required." });
        }

        // Find the user's cart
        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.json({ success: true, isInCart: false });
        }

        // Check if the product variant is in the cart
        const isInCart = cart.items.some(item => 
            item.product.toString() === productId && item.variantIndex === parseInt(variantIndex)
        );

        return res.json({ success: true, isInCart });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('[CART] Error in checkCartStatus:', error);
        return res.status(500).json({ success: false, message: "Server error while checking cart status." });
    }
};

module.exports = {
    getCart,
    addToCart,
    updateQuantity,
    removeFromCart,
    checkCartStatus
};