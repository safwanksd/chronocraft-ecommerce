// controllers/user/wishlistController.js

const Wishlist = require("../../models/wishlistSchema");
const Product = require("../../models/productSchema");

// Retrieves the user's wishlist with pagination
const getWishlist = async (req, res) => {
    try {
        if (!req.session.user) {
            if (req.xhr) {
                return res.status(401).json({ success: false, message: "Unauthorized. Please log in.", redirect: "/user/login" });
            }
            return res.redirect("/user/login");
        }

        const page = parseInt(req.query.page) || 1; // Get page number from query
        const limit = 4; // Number of wishlist items per page
        const skip = (page - 1) * limit;

        const wishlistItems = await Wishlist.find({ userId: req.session.user._id })
            .populate({
                path: 'product',
                populate: [
                    { path: 'category', select: 'name isListed' },
                    { path: 'brand', select: 'brandName isBlocked' }
                ]
            })
            .skip(skip)
            .limit(limit);

        // Filter out blocked/unlisted products
        const filteredWishlist = wishlistItems.filter(item => {
            const product = item.product;
            return product && !product.isBlocked && product.category.isListed && !product.brand.isBlocked;
        });

        const totalItems = await Wishlist.countDocuments({ userId: req.session.user._id });
        const totalPages = Math.ceil(totalItems / limit);

        if (req.xhr) {
            return res.json({ success: true, wishlist: filteredWishlist, totalPages, currentPage: page });
        }

        res.render("user/wishlist", { wishlist: filteredWishlist, totalPages, currentPage: page });
    } catch (error) {
        console.error('[WISHLIST] Error fetching wishlist:', error);
        if (req.xhr) {
            return res.status(500).json({ success: false, message: "Server error. Please try again." });
        }
        res.status(500).render("user/error", { message: "Server Error" });
    }
};

// Adds a product to the user's wishlist
const addToWishlist = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in.", redirect: "/user/login" });
        }

        const { productId, variantIndex } = req.body;
        const userId = req.session.user._id;

        // Validate input
        if (!productId || variantIndex === undefined) {
            return res.status(400).json({ success: false, message: "Product ID and variant index are required." });
        }

        // Check if product exists and is not blocked
        const product = await Product.findOne({ _id: productId, isBlocked: false })
            .populate("category", "isListed")
            .populate("brand", "isBlocked");

        if (!product || !product.category.isListed || product.brand.isBlocked) {
            return res.status(404).json({ success: false, message: "Product is not available or blocked." });
        }

        const variant = product.variants[variantIndex];
        if (!variant) {
            return res.status(400).json({ success: false, message: "Invalid variant selected." });
        }

        // Check if item already exists in wishlist
        const existingWishlistItem = await Wishlist.findOne({ userId, product: productId, "variant.color": variant.color });
        if (existingWishlistItem) {
            return res.status(400).json({ success: false, message: "This variant is already in your wishlist." });
        }

        // Create new wishlist item
        const wishlistItem = new Wishlist({
            userId,
            product: productId,
            variant: {
                color: variant.color,
                colorName: variant.colorName,
                stock: variant.stock,
                price: variant.price,
                salePrice: variant.salePrice,
                productImage: variant.productImages,
                status: variant.status
            }
        });

        await wishlistItem.save();

        res.status(201).json({
            success: true,
            message: "Product added to wishlist successfully!",
            data: { wishlistId: wishlistItem._id }
        });
    } catch (error) {
        console.error('[WISHLIST] Error adding to wishlist:', error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

// Removes a product from the user's wishlist
const removeFromWishlist = async (req, res) => {
    try {
        const { wishlistId } = req.params;
        const userId = req.session.user._id;

        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in.", redirect: "/user/login" });
        }

        // Validate input
        if (!wishlistId) {
            return res.status(400).json({ success: false, message: "Wishlist ID is required." });
        }

        // Find and remove wishlist item
        const wishlistItem = await Wishlist.findOneAndDelete({ _id: wishlistId, userId });
        if (!wishlistItem) {
            return res.status(404).json({ success: false, message: "Wishlist item not found." });
        }

        res.json({ success: true, message: "Product removed from wishlist successfully!" });
    } catch (error) {
        console.error('[WISHLIST] Error removing from wishlist:', error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

// Updates the variant of a product in the user's wishlist
const updateWishlistVariant = async (req, res) => {
    try {
        const { wishlistId } = req.params;
        const { variantIndex } = req.body;
        const userId = req.session.user._id;

        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in.", redirect: "/user/login" });
        }

        // Validate input
        if (!wishlistId || variantIndex === undefined) {
            return res.status(400).json({ success: false, message: "Wishlist ID and variant index are required." });
        }

        // Find wishlist item
        const wishlistItem = await Wishlist.findOne({ _id: wishlistId, userId })
            .populate('product');

        if (!wishlistItem) {
            return res.status(404).json({ success: false, message: "Wishlist item not found." });
        }

        const variant = wishlistItem.product.variants[variantIndex];
        if (!variant) {
            return res.status(400).json({ success: false, message: "Invalid variant selected." });
        }

        // Update variant data
        wishlistItem.variant = {
            color: variant.color,
            colorName: variant.colorName,
            stock: variant.stock,
            price: variant.price,
            salePrice: variant.salePrice,
            productImage: variant.productImages,
            status: variant.status
        };

        await wishlistItem.save();

        res.json({ success: true, message: "Wishlist variant updated successfully!" });
    } catch (error) {
        console.error('[WISHLIST] Error updating wishlist variant:', error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

module.exports = {
    getWishlist,
    addToWishlist,
    removeFromWishlist,
    updateWishlistVariant
};