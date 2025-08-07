// controllers/admin/offerController.js

const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

// Helper function to calculate the discounted price
const applyDiscount = (price, discount) => {
    // Rounds the price after applying the discount percentage
    return Math.round(price * (1 - discount / 100));
};

// Helper function to update sale prices for products based on an offer
const updateProductSalePrices = async (products, discount) => {
    // Iterates over each product to update its variant sale prices
    for (let product of products) {
        for (let variant of product.variants) {
            const originalPrice = variant.price;
            const defaultSalePrice = variant.salePrice || originalPrice; // Falls back to original price if no sale price
            const offerPrice = discount > 0 ? applyDiscount(originalPrice, discount) : originalPrice;
            const newSalePrice = Math.min(defaultSalePrice, offerPrice);
            if (variant.salePrice !== newSalePrice) {
                variant.salePrice = newSalePrice;
            }
        }
        await product.save(); // Saves the updated product
    }
};

// Helper function to revert product sale prices when an offer ends or is deactivated
const revertProductSalePrices = async (products) => {
    // Reverts sale prices back to original prices for each product
    for (let product of products) {
        for (let variant of product.variants) {
            const originalPrice = variant.price;
            if (variant.salePrice !== originalPrice) {
                variant.salePrice = originalPrice;
            }
        }
        await product.save(); // Saves the reverted product
    }
};

// Renders the offer management page with a list of offers
const getOffersPage = async (req, res) => {
    try {
        const type = req.query.type || 'category'; // Defaults to category offers if no type specified
        let offers = await Offer.find({ type }).sort({ createdAt: -1 });

        // Checks for and deactivates expired offers
        const currentDate = new Date();
        for (let offer of offers) {
            if (offer.isActive && offer.endDate < currentDate) {
                offer.isActive = false;
                await offer.save();

                // Removes offer reference and reverts sale prices for affected products
                let affectedProducts = [];
                if (offer.type === 'product') {
                    const product = await Product.findById(offer.targetId);
                    if (product) {
                        affectedProducts = [product];
                        await Product.findByIdAndUpdate(offer.targetId, { productOffer: null });
                    }
                } else if (offer.type === 'category') {
                    const category = await Category.findById(offer.targetId);
                    if (category) {
                        affectedProducts = await Product.find({ category: offer.targetId, isBlocked: false });
                        await Category.findByIdAndUpdate(offer.targetId, { categoryOffer: null });
                    }
                }
                await revertProductSalePrices(affectedProducts);
            }
        }

        // Refreshes the offer list to reflect any changes
        offers = await Offer.find({ type }).sort({ createdAt: -1 });
        for (let offer of offers) {
            if (offer.type === 'product') {
                await offer.populate({ path: 'targetId', model: 'Product' });
            } else if (offer.type === 'category') {
                await offer.populate({ path: 'targetId', model: 'Category' });
            }
        }

        res.render('admin/offers', { offers, activeTab: type });
    } catch (error) {
        // Handles errors by rendering an error page with a user-friendly message
        console.error('Error fetching offers:', error);
        res.status(500).render('error', { message: 'Server error while fetching offers' });
    }
};

// Renders the page to add a new offer with available products and categories
const getAddOfferPage = async (req, res) => {
    try {
        const products = await Product.find({ isBlocked: false });
        const categories = await Category.find({ isListed: true });
        res.render('admin/add-offer', { products, categories, error: null });
    } catch (error) {
        // Handles errors by rendering an error page
        console.error('Error loading add offer page:', error);
        res.status(500).render('error', { message: 'Server error while loading add offer page' });
    }
};

// Processes the creation of a new offer
const addOffer = async (req, res) => {
    try {
        const { name, type, targetId, discount, startDate, endDate } = req.body;

        // Validates that all required fields are provided
        if (!name || !type || !targetId || !discount || !startDate || !endDate) {
            const products = await Product.find({ isBlocked: false });
            const categories = await Category.find({ isListed: true });
            return res.status(400).render('admin/add-offer', {
                products,
                categories,
                error: 'All fields are required',
            });
        }

        // Ensures the discount is a valid percentage
        if (isNaN(discount) || discount < 0 || discount > 100) {
            const products = await Product.find({ isBlocked: false });
            const categories = await Category.find({ isListed: true });
            return res.status(400).render('admin/add-offer', {
                products,
                categories,
                error: 'Discount must be a number between 0 and 100%',
            });
        }

        // Checks if the target exists and gathers affected products
        let affectedProducts = [];
        if (type === 'product') {
            const product = await Product.findById(targetId);
            if (!product || product.isBlocked) {
                const products = await Product.find({ isBlocked: false });
                const categories = await Category.find({ isListed: true });
                return res.status(400).render('admin/add-offer', {
                    products,
                    categories,
                    error: 'Selected product not found or blocked',
                });
            }
            affectedProducts = [product];
        } else if (type === 'category') {
            const category = await Category.findById(targetId);
            if (!category || !category.isListed) {
                const products = await Product.find({ isBlocked: false });
                const categories = await Category.find({ isListed: true });
                return res.status(400).render('admin/add-offer', {
                    products,
                    categories,
                    error: 'Selected category not found or unlisted',
                });
            }
            affectedProducts = await Product.find({ category: targetId, isBlocked: false });
        }

        // Prevents multiple active offers on the same target
        const existingOffer = await Offer.findOne({ type, targetId, isActive: true });
        if (existingOffer) {
            const products = await Product.find({ isBlocked: false });
            const categories = await Category.find({ isListed: true });
            return res.status(400).render('admin/add-offer', {
                products,
                categories,
                error: `An active offer already exists for this ${type}`,
            });
        }

        // Creates and saves the new offer
        const offer = new Offer({
            name,
            type,
            targetId,
            discount: Number(discount),
            startDate,
            endDate,
        });
        await offer.save();

        // Updates the product or category with the new offer reference
        if (type === 'product') {
            await Product.findByIdAndUpdate(targetId, { productOffer: offer._id });
        } else if (type === 'category') {
            await Category.findByIdAndUpdate(targetId, { categoryOffer: offer._id });
        }

        // Applies the discount to affected products
        await updateProductSalePrices(affectedProducts, Number(discount));
        res.redirect('/admin/offers');
    } catch (error) {
        console.error('Error adding offer:', error);
        // Handles errors by rendering the add offer page with an error message
        const products = await Product.find({ isBlocked: false });
        const categories = await Category.find({ isListed: true });
        res.status(500).render('admin/add-offer', {
            products,
            categories,
            error: error.message || 'Server error while creating offer',
        });
    }
};

// Renders the page to edit an existing offer
const getEditOfferPage = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) {
            return res.status(404).render('error', { message: 'Offer not found' });
        }
        if (offer.type === 'product') {
            await offer.populate({ path: 'targetId', model: 'Product' });
        } else if (offer.type === 'category') {
            await offer.populate({ path: 'targetId', model: 'Category' });
        }
        const products = await Product.find({ isBlocked: false });
        const categories = await Category.find({ isListed: true });
        res.render('admin/edit-offer', { offer, products, categories, error: null });
    } catch (error) {
        // Handles errors by rendering an error page
        console.error('Error loading edit offer page:', error);
        res.status(500).render('error', { message: 'Server error while loading edit offer page' });
    }
};

// Processes updates to an existing offer
const editOffer = async (req, res) => {
    try {
        const { name, type, targetId, discount, startDate, endDate } = req.body;

        // Validates that all required fields are provided
        if (!name || !type || !targetId || !discount || !startDate || !endDate) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Ensures the discount is a valid percentage
        if (isNaN(discount) || discount < 0 || discount > 100) {
            return res.status(400).json({ message: 'Discount must be a number between 0 and 100%' });
        }

        // Checks if the new target exists and gathers affected products
        let newAffectedProducts = [];
        if (type === 'product') {
            const product = await Product.findById(targetId);
            if (!product || product.isBlocked) {
                return res.status(400).json({ message: 'Selected product not found or blocked' });
            }
            newAffectedProducts = [product];
        } else if (type === 'category') {
            const category = await Category.findById(targetId);
            if (!category || !category.isListed) {
                return res.status(400).json({ message: 'Selected category not found or unlisted' });
            }
            newAffectedProducts = await Product.find({ category: targetId, isBlocked: false });
        }

        // Retrieves the offer to update
        const offer = await Offer.findById(req.params.id);
        if (!offer) {
            return res.status(404).json({ message: 'Offer not found' });
        }

        // Handles changes to target or type by reverting old sale prices
        let oldAffectedProducts = [];
        if (offer.type !== type || offer.targetId.toString() !== targetId) {
            if (offer.type === 'product') {
                const product = await Product.findById(offer.targetId);
                if (product) {
                    oldAffectedProducts = [product];
                    await Product.findByIdAndUpdate(offer.targetId, { productOffer: null });
                }
            } else if (offer.type === 'category') {
                const category = await Category.findById(offer.targetId);
                if (category) {
                    oldAffectedProducts = await Product.find({ category: offer.targetId, isBlocked: false });
                    await Category.findByIdAndUpdate(offer.targetId, { categoryOffer: null });
                }
            }
            await revertProductSalePrices(oldAffectedProducts);
        }

        // Updates the offer details
        offer.name = name;
        offer.type = type;
        offer.targetId = targetId;
        offer.discount = Number(discount);
        offer.startDate = new Date(startDate);
        offer.endDate = new Date(endDate);
        await offer.save();

        // Updates the product or category with the new offer reference
        if (type === 'product') {
            await Product.findByIdAndUpdate(targetId, { productOffer: offer._id });
        } else if (type === 'category') {
            await Category.findByIdAndUpdate(targetId, { categoryOffer: offer._id });
        }

        // Applies the updated discount to affected products
        await updateProductSalePrices(newAffectedProducts, Number(discount));
        res.status(200).json({ success: true, message: 'Offer updated successfully' });
    } catch (error) {
        console.error('Error editing offer:', error);
        // Handles errors by returning a JSON response with an error message
        res.status(500).json({ message: error.message || 'Server error while updating offer' });
    }
};

// Toggles the active status of an offer
const toggleOfferStatus = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }

        const previousStatus = offer.isActive;
        offer.isActive = !offer.isActive;
        await offer.save();

        // Handles deactivation by removing references and reverting prices
        if (!offer.isActive) {
            let affectedProducts = [];
            if (offer.type === 'product') {
                const product = await Product.findById(offer.targetId);
                if (product) {
                    affectedProducts = [product];
                    await Product.findByIdAndUpdate(offer.targetId, { productOffer: null });
                }
            } else if (offer.type === 'category') {
                const category = await Category.findById(offer.targetId);
                if (category) {
                    affectedProducts = await Product.find({ category: offer.targetId, isBlocked: false });
                    await Category.findByIdAndUpdate(offer.targetId, { categoryOffer: null });
                }
            }
            await revertProductSalePrices(affectedProducts);
        } else {
            // Handles reactivation by reassigning references and updating prices
            let affectedProducts = [];
            if (offer.type === 'product') {
                const product = await Product.findById(offer.targetId);
                if (product) {
                    affectedProducts = [product];
                    await Product.findByIdAndUpdate(offer.targetId, { productOffer: offer._id });
                }
            } else if (offer.type === 'category') {
                const category = await Category.findById(offer.targetId);
                if (category) {
                    affectedProducts = await Product.find({ category: offer.targetId, isBlocked: false });
                    await Category.findByIdAndUpdate(offer.targetId, { categoryOffer: offer._id });
                }
            }
            await updateProductSalePrices(affectedProducts, offer.discount);
        }

        res.json({
            success: true,
            message: `Offer ${offer.isActive ? 'activated' : 'deactivated'} successfully`,
            isActive: offer.isActive // Returns the new status
        });
    } catch (error) {
        // Handles errors with a JSON response
        console.error('Error toggling offer status:', error);
        res.status(500).json({ success: false, message: 'Server error while toggling offer status' });
    }
};

// Handles the deactivation of expired offers, intended for cron jobs or manual execution
const handleExpiredOffers = async () => {
    try {
        const currentDate = new Date();
        const expiredOffers = await Offer.find({
            isActive: true,
            endDate: { $lt: currentDate },
        });

        for (let offer of expiredOffers) {
            offer.isActive = false;
            await offer.save();

            let affectedProducts = [];
            if (offer.type === 'product') {
                const product = await Product.findById(offer.targetId);
                if (product) {
                    affectedProducts = [product];
                    await Product.findByIdAndUpdate(offer.targetId, { productOffer: null });
                }
            } else if (offer.type === 'category') {
                const category = await Category.findById(offer.targetId);
                if (category) {
                    affectedProducts = await Product.find({ category: offer.targetId, isBlocked: false });
                    await Category.findByIdAndUpdate(offer.targetId, { categoryOffer: null });
                }
            }

            // Reverts sale prices for affected products
            await revertProductSalePrices(affectedProducts);
        }
    } catch (error) {
        // Logs the error but continues execution to handle other offers
        console.error('Error handling expired offers:', error);
    }
};

module.exports = {
    getOffersPage,
    getAddOfferPage,
    addOffer,
    getEditOfferPage,
    editOffer,
    toggleOfferStatus,
    handleExpiredOffers,
};