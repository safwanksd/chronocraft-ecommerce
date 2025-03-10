// controllers/user/cartController.js

const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");

// Get Cart
const getCart = async (req, res) => {
    console.log('[CART] Fetching cart for user:', req.session.user ? req.session.user._id : 'unauthenticated');
    try {
        if (!req.session.user) {
            if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
                return res.status(401).json({ success: false, message: "Unauthorized. Please log in.", redirect: "/user/login" });
            }
            return res.redirect("/user/login");
        }

        const cart = await Cart.findOne({ user: req.session.user._id })
            .populate({
                path: 'items.product',
                populate: [
                    { path: 'category', select: 'name isListed' }, // Ensure category name is included
                    { path: 'brand', select: 'isBlocked' }
                ]
            });

        if (!cart) {
            if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
                return res.json({ success: true, cart: { items: [], totalAmount: 0 } });
            }
            return res.render("user/cart", { cart: { items: [], totalAmount: 0 } });
        }

        // Filter out blocked/unlisted products
        cart.items = cart.items.filter(item => {
            const product = item.product;
            return !product.isBlocked && product.category.isListed && !product.brand.isBlocked;
        });

        // Recalculate totalAmount after filtering
        cart.totalAmount = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        await cart.save();

        if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
            return res.json({ success: true, cart });
        }
        res.render("user/cart", { cart });
    } catch (error) {
        console.error('[CART] Error fetching cart:', error);
        if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
            return res.status(500).json({ success: false, message: "Server error. Please try again." });
        }
        res.status(500).render("error", { message: "Server Error" });
    }
};

// Add to Cart
const addToCart = async (req, res) => {
    console.log('[CART] Adding product to cart:', req.body.productId, 'Variant Index:', req.body.variantIndex);
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
                price: variant.price 
            });
        }

        // Prepare for future wishlist removal (placeholder)
        // const user = await User.findById(userId);
        // if (user.wishlist.includes(productId)) {
        //     user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
        //     await user.save();
        // }

        cart.totalAmount = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        await cart.save();

        res.json({ success: true, message: "Product added to cart successfully!" });
    } catch (error) {
        console.error('[CART] Error adding to cart:', error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

// Update Quantity (Increment/Decrement)
const updateQuantity = async (req, res) => {
    console.log('[CART] Updating quantity for item:', req.params.itemId);
    try {
        const { itemId } = req.params;
        const { action } = req.body; // "increment" or "decrement"
        const userId = req.session.user._id;

        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in.", redirect: "/user/login" });
        }

        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.json({ success: false, message: "Cart not found." });
        }

        const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
        if (itemIndex === -1) {
            return res.json({ success: false, message: "Item not found in cart." });
        }

        const item = cart.items[itemIndex];
        const product = await Product.findById(item.product);
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

        cart.totalAmount = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        await cart.save();

        res.json({ 
            success: true, 
            message: "Quantity updated successfully!", 
            newQuantity: item.quantity,
            newTotal: cart.totalAmount,
            pricePerUnit: item.price // Add price per unit to the response
        });
    } catch (error) {
        console.error('[CART] Error updating quantity:', error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

// Remove from Cart
const removeFromCart = async (req, res) => {
    console.log('[CART] Removing item from cart:', req.params.itemId);
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

        cart.totalAmount = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        await cart.save();

        res.json({ success: true, message: "Item removed from cart successfully!", newTotal: cart.totalAmount });
    } catch (error) {
        console.error('[CART] Error removing item:', error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

module.exports = {
    getCart,
    addToCart,
    updateQuantity,
    removeFromCart
};