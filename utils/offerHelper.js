// utils/offerHelper.js

const Offer = require('../models/offerSchema');
const Category = require('../models/categorySchema');

// Calculates the effective discount for a product based on product and category offers
const getEffectiveDiscount = async (productId) => {
    try {
        // Find the product
        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return { discount: 0, offerId: null };
        }

        // Check for product offer
        let productDiscount = 0;
        let productOfferId = null;
        if (product.productOffer) {
            const productOffer = await Offer.findById(product.productOffer);
            if (productOffer && productOffer.isActive && productOffer.startDate <= new Date() && productOffer.endDate >= new Date()) {
                productDiscount = productOffer.discount;
                productOfferId = productOffer._id;
            }
        }

        // Check for category offer
        let categoryDiscount = 0;
        let categoryOfferId = null;
        const category = await Category.findById(product.category);
        if (category && category.categoryOffer) {
            const categoryOffer = await Offer.findById(category.categoryOffer);
            if (categoryOffer && categoryOffer.isActive && categoryOffer.startDate <= new Date() && categoryOffer.endDate >= new Date()) {
                categoryDiscount = categoryOffer.discount;
                categoryOfferId = categoryOffer._id;
            }
        }

        // Return the higher discount
        if (productDiscount >= categoryDiscount) {
            return { discount: productDiscount, offerId: productOfferId };
        } else {
            return { discount: categoryDiscount, offerId: categoryOfferId };
        }
    } catch (error) {
        console.error('Error calculating effective discount:', error);
        return { discount: 0, offerId: null };
    }
};

// Applies the effective discount to a product price
const applyDiscount = (actualPrice, discount) => {
    if (!discount || discount <= 0) return actualPrice;
    const discountAmount = (actualPrice * discount) / 100;
    return Math.round(actualPrice - discountAmount);
};

module.exports = {
    getEffectiveDiscount,
    applyDiscount,
};