// controllers/user/productController.js

const Product = require("../../models/productSchema");
const Brand = require("../../models/brandSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema");
const Offer = require("../../models/offerSchema");

// Utility function to get effective discount based on product and category offers
const getEffectiveDiscountForProduct = async (product) => {
    const currentDate = new Date();
    let effectiveDiscount = 0;

    // Check product offer
    if (product.productOffer) {
        const productOffer = await Offer.findById(product.productOffer);
        if (productOffer && productOffer.isActive && productOffer.startDate <= currentDate && productOffer.endDate >= currentDate) {
            effectiveDiscount = Math.max(effectiveDiscount, productOffer.discount);
        }
    }

    // Check category offer
    const category = await Category.findById(product.category);
    if (category && category.categoryOffer) {
        const categoryOffer = await Offer.findById(category.categoryOffer);
        if (categoryOffer && categoryOffer.isActive && categoryOffer.startDate <= currentDate && categoryOffer.endDate >= currentDate) {
            effectiveDiscount = Math.max(effectiveDiscount, categoryOffer.discount);
        }
    }

    return effectiveDiscount;
};

// Utility function to apply discount to a price
const applyDiscount = (price, discountPercentage) => {
    return Math.round(price - (price * discountPercentage / 100));
};

// Renders the shop page with filtered and sorted products
const getShopPage = async (req, res) => {
    try {
        const { search = "", sort = "", category = "", brand = "", page = 1 } = req.query;
        const limit = 8;
        const skip = (parseInt(page) - 1) * limit;

        let filter = { 
            isBlocked: false,
            category: { $in: await Category.find({ isListed: true }).distinct('_id') },
            brand: { $in: await Brand.find({ isBlocked: false }).distinct('_id') }
        };

        if (search) {
            filter.productName = { $regex: search, $options: "i" };
        }
        if (category) {
            const selectedCategory = await Category.findOne({ _id: category, isListed: true });
            if (!selectedCategory) {
                filter.category = null;
            } else {
                filter.category = category;
            }
        }
        if (brand) {
            const selectedBrand = await Brand.findOne({ _id: brand, isBlocked: false });
            if (!selectedBrand) {
                filter.brand = null;
            } else {
                filter.brand = brand;
            }
        }

        let sortOption = {};
        switch (sort) {
            case "low-high":
                sortOption = { "variants.0.salePrice": 1 };
                break;
            case "high-low":
                sortOption = { "variants.0.salePrice": -1 };
                break;
            case "name-asc":
                sortOption = { productName: 1 };
                break;
            case "name-desc":
                sortOption = { productName: -1 };
                break;
            default:
                sortOption = { createdAt: -1 };
        }

        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);

        const products = await Product.find(filter)
            .populate("category", "name categoryOffer")
            .populate("brand", "brandName")
            .sort(sortOption)
            .skip(skip)
            .limit(limit);

        // Calculate effective prices and offer discounts
        const currentDate = new Date();
        for (let product of products) {
            const variant = product.variants[0] || {};
            const originalPrice = variant.price || 0;
            const manualSalePrice = variant.salePrice || originalPrice;
            const effectiveDiscount = await getEffectiveDiscountForProduct(product);
            const offerSalePrice = effectiveDiscount > 0 ? applyDiscount(originalPrice, effectiveDiscount) : originalPrice;

            variant.displaySalePrice = Math.min(manualSalePrice, offerSalePrice) || originalPrice;
            variant.offerDiscount = effectiveDiscount > 0 ? effectiveDiscount : 0;
        }

        if (req.xhr || req.headers.accept.includes('json')) {
            const productsHTML = products.map(product => {
                const variant = product.variants[0] || {};
                const salePrice = variant.displaySalePrice || variant.price || 0;
                const originalPrice = variant.price || 0;
                const offerDiscount = variant.offerDiscount || 0;
                return `
                    <div class="col mb-4">
                        <div class="card product-card h-100">
                            <div class="wishlist-button">
                                <button class="btn btn-wishlist" onclick="toggleWishlist('${product._id}', this)" data-product-id="${product._id}">
                                    <i class="far fa-heart"></i>
                                </button>
                            </div>
                            <img src="${variant.productImages && variant.productImages[0] ? variant.productImages[0] : '/images/placeholder.jpg'}" 
                                 class="card-img-top" 
                                 alt="${product.productName}">
                            <div class="card-body d-flex flex-column">
                                <h5 class="card-title text-black text-shadow">${product.productName}</h5>
                                <p class="card-text text-gray mb-2">${product.brand.brandName} | ${product.category.name}</p>
                                <p class="card-text mb-3">
                                    <strong class="text-dark">₹${salePrice.toLocaleString('en-IN')}</strong>
                                    ${salePrice < originalPrice ? `
                                        <span class="original-price text-muted ms-2"><s>₹${originalPrice.toLocaleString('en-IN')}</s></span>
                                    ` : ''}
                                    ${offerDiscount > 0 ? `
                                        <span class="offer-badge">${offerDiscount}% OFF</span>
                                    ` : ''}
                                </p>
                                <a href="/user/product-detail/${product._id}" class="btn btn-black mt-auto">View Details</a>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            return res.send(productsHTML);
        }

        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isBlocked: false });

        res.render("user/shop", { 
            products,
            categories,
            brands,
            currentFilters: { search, sort, category, brand },
            currentPage: parseInt(page),
            totalPages
        });
    } catch (error) {
        console.error('[PRODUCT] Error in getShopPage:', error);
        if (req.xhr) {
            return res.status(500).send('<div class="col-12 text-center"><p class="text-danger">Error loading products. Please try again.</p></div>');
        }
        res.status(500).render("error", { message: "Server Error" });
    }
};

// Renders the men category page with filtered and sorted products
const getMenPage = async (req, res) => {
    try {
        const { sort = "", brand = "", page = 1 } = req.query;
        const limit = 4;
        const skip = (parseInt(page) - 1) * limit;

        const menCategory = await Category.findOne({ name: "Men", isListed: true });
        if (!menCategory) {
            return res.render("user/men", {
                products: [],
                brands: [],
                currentFilters: { sort, brand },
                currentPage: 1,
                totalPages: 0
            });
        }

        let filter = { 
            isBlocked: false,
            category: menCategory._id,
            brand: { $in: await Brand.find({ isBlocked: false }).distinct('_id') }
        };

        if (brand) {
            const selectedBrand = await Brand.findOne({ _id: brand, isBlocked: false });
            if (!selectedBrand) {
                filter.brand = null;
            } else {
                filter.brand = brand;
            }
        }

        let sortOption = {};
        switch (sort) {
            case "low-high":
                sortOption = { "variants.0.salePrice": 1 };
                break;
            case "high-low":
                sortOption = { "variants.0.salePrice": -1 };
                break;
            case "name-asc":
                sortOption = { productName: 1 };
                break;
            case "name-desc":
                sortOption = { productName: -1 };
                break;
            default:
                sortOption = { createdAt: -1 };
        }

        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);

        const products = await Product.find(filter)
            .populate("category", "name categoryOffer")
            .populate("brand", "brandName")
            .sort(sortOption)
            .skip(skip)
            .limit(limit);

        // Calculate effective prices and offer discounts
        const currentDate = new Date();
        for (let product of products) {
            const variant = product.variants[0] || {};
            const originalPrice = variant.price || 0;
            const manualSalePrice = variant.salePrice || originalPrice;
            const effectiveDiscount = await getEffectiveDiscountForProduct(product);
            const offerSalePrice = effectiveDiscount > 0 ? applyDiscount(originalPrice, effectiveDiscount) : originalPrice;

            variant.displaySalePrice = Math.min(manualSalePrice, offerSalePrice) || originalPrice;
            variant.offerDiscount = effectiveDiscount > 0 ? effectiveDiscount : 0;
        }

        if (req.xhr || req.headers.accept.includes('json')) {
            const productsHTML = products.map(product => {
                const variant = product.variants[0] || {};
                const salePrice = variant.displaySalePrice || variant.price || 0;
                const originalPrice = variant.price || 0;
                const offerDiscount = variant.offerDiscount || 0;
                return `
                    <div class="col mb-4">
                        <div class="card product-card h-100">
                            <div class="wishlist-button">
                                <button class="btn btn-wishlist" onclick="addToWishlist('${product._id}')">
                                    <i class="far fa-heart"></i>
                                </button>
                            </div>
                            <img src="${variant.productImages && variant.productImages[0] ? variant.productImages[0] : '/images/placeholder.jpg'}" 
                                 class="card-img-top" 
                                 alt="${product.productName}">
                            <div class="card-body d-flex flex-column">
                                <h5 class="card-title text-black text-shadow">${product.productName}</h5>
                                <p class="card-text text-gray mb-2">${product.brand.brandName}</p>
                                <p class="card-text mb-3">
                                    <strong class="text-dark">₹${salePrice.toLocaleString('en-IN')}</strong>
                                    ${salePrice < originalPrice ? `
                                        <span class="original-price text-muted ms-2"><s>₹${originalPrice.toLocaleString('en-IN')}</s></span>
                                    ` : ''}
                                    ${offerDiscount > 0 ? `
                                        <span class="offer-badge">${offerDiscount}% OFF</span>
                                    ` : ''}
                                </p>
                                <a href="/user/product-detail/${product._id}" class="btn btn-black mt-auto">View Details</a>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            return res.send(productsHTML);
        }

        const brands = await Brand.find({ isBlocked: false });

        res.render("user/men", { 
            products,
            brands,
            currentFilters: { sort, brand },
            currentPage: parseInt(page),
            totalPages
        });
    } catch (error) {
        console.error('[PRODUCT] Error in getMenPage:', error);
        if (req.xhr) {
            return res.status(500).send('<div class="col-12 text-center"><p class="text-danger">Error loading men\'s watches. Please try again.</p></div>');
        }
        res.status(500).render("error", { message: "Server Error" });
    }
};

// Renders the women category page with filtered and sorted products
const getWomenPage = async (req, res) => {
    try {
        const { sort = "", brand = "", page = 1 } = req.query;
        const limit = 4;
        const skip = (parseInt(page) - 1) * limit;

        const womenCategory = await Category.findOne({ name: "Women", isListed: true });
        if (!womenCategory) {
            return res.render("user/women", {
                products: [],
                brands: [],
                currentFilters: { sort, brand },
                currentPage: 1,
                totalPages: 0
            });
        }

        let filter = { 
            isBlocked: false,
            category: womenCategory._id,
            brand: { $in: await Brand.find({ isBlocked: false }).distinct('_id') }
        };

        if (brand) {
            const selectedBrand = await Brand.findOne({ _id: brand, isBlocked: false });
            if (!selectedBrand) {
                filter.brand = null;
            } else {
                filter.brand = brand;
            }
        }

        let sortOption = {};
        switch (sort) {
            case "low-high":
                sortOption = { "variants.0.salePrice": 1 };
                break;
            case "high-low":
                sortOption = { "variants.0.salePrice": -1 };
                break;
            case "name-asc":
                sortOption = { productName: 1 };
                break;
            case "name-desc":
                sortOption = { productName: -1 };
                break;
            default:
                sortOption = { createdAt: -1 };
        }

        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);

        const products = await Product.find(filter)
            .populate("category", "name categoryOffer")
            .populate("brand", "brandName")
            .sort(sortOption)
            .skip(skip)
            .limit(limit);

        // Calculate effective prices and offer discounts
        const currentDate = new Date();
        for (let product of products) {
            const variant = product.variants[0] || {};
            const originalPrice = variant.price || 0;
            const manualSalePrice = variant.salePrice || originalPrice;
            const effectiveDiscount = await getEffectiveDiscountForProduct(product);
            const offerSalePrice = effectiveDiscount > 0 ? applyDiscount(originalPrice, effectiveDiscount) : originalPrice;

            variant.displaySalePrice = Math.min(manualSalePrice, offerSalePrice) || originalPrice;
            variant.offerDiscount = effectiveDiscount > 0 ? effectiveDiscount : 0;
        }

        if (req.xhr || req.headers.accept.includes('json')) {
            const productsHTML = products.map(product => {
                const variant = product.variants[0] || {};
                const salePrice = variant.displaySalePrice || variant.price || 0;
                const originalPrice = variant.price || 0;
                const offerDiscount = variant.offerDiscount || 0;
                return `
                    <div class="col mb-4">
                        <div class="card product-card h-100">
                            <div class="wishlist-button">
                                <button class="btn btn-wishlist" onclick="addToWishlist('${product._id}')">
                                    <i class="far fa-heart"></i>
                                </button>
                            </div>
                            <img src="${variant.productImages && variant.productImages[0] ? variant.productImages[0] : '/images/placeholder.jpg'}" 
                                 class="card-img-top" 
                                 alt="${product.productName}">
                            <div class="card-body d-flex flex-column">
                                <h5 class="card-title text-black text-shadow">${product.productName}</h5>
                                <p class="card-text text-gray mb-2">${product.brand.brandName}</p>
                                <p class="card-text mb-3">
                                    <strong class="text-dark">₹${salePrice.toLocaleString('en-IN')}</strong>
                                    ${salePrice < originalPrice ? `
                                        <span class="original-price text-muted ms-2"><s>₹${originalPrice.toLocaleString('en-IN')}</s></span>
                                    ` : ''}
                                    ${offerDiscount > 0 ? `
                                        <span class="offer-badge">${offerDiscount}% OFF</span>
                                    ` : ''}
                                </p>
                                <a href="/user/product-detail/${product._id}" class="btn btn-black mt-auto">View Details</a>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            return res.send(productsHTML);
        }

        const brands = await Brand.find({ isBlocked: false });

        res.render("user/women", { 
            products,
            brands,
            currentFilters: { sort, brand },
            currentPage: parseInt(page),
            totalPages
        });
    } catch (error) {
        console.error('[PRODUCT] Error in getWomenPage:', error);
        if (req.xhr) {
            return res.status(500).send('<div class="col-12 text-center"><p class="text-danger">Error loading women\'s watches. Please try again.</p></div>');
        }
        res.status(500).render("error", { message: "Server Error" });
    }
};

// Renders the product details page with related products
const getProductDetails = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findOne({ 
            _id: productId,
            isBlocked: false,
            category: { $in: await Category.find({ isListed: true }).distinct('_id') },
            brand: { $in: await Brand.find({ isBlocked: false }).distinct('_id') }
        })
            .populate("brand", "brandName")
            .populate("category", "name categoryOffer");

        if (!product) {
            return res.redirect('/user/shop');
        }

        // Calculate effective price for all variants
        for (let variant of product.variants) {
            const originalPrice = variant.price || 0;
            const manualSalePrice = variant.salePrice || originalPrice;
            const effectiveDiscount = await getEffectiveDiscountForProduct(product);
            const offerSalePrice = effectiveDiscount > 0 ? applyDiscount(originalPrice, effectiveDiscount) : originalPrice;

            variant.displaySalePrice = Math.min(manualSalePrice, offerSalePrice) || originalPrice;
            variant.offerDiscount = effectiveDiscount > 0 ? effectiveDiscount : 0;
        }

        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: product._id },
            isBlocked: false,
            category: { $in: await Category.find({ isListed: true }).distinct('_id') },
            brand: { $in: await Brand.find({ isBlocked: false }).distinct('_id') }
        })
            .populate("brand", "brandName")
            .limit(4);

        // Calculate effective prices for related products
        for (let relatedProduct of relatedProducts) {
            const relatedVariant = relatedProduct.variants[0] || {};
            const relatedOriginalPrice = relatedVariant.price || 0;
            const relatedManualSalePrice = relatedVariant.salePrice || relatedOriginalPrice;
            const relatedEffectiveDiscount = await getEffectiveDiscountForProduct(relatedProduct);
            const relatedOfferSalePrice = relatedEffectiveDiscount > 0 ? applyDiscount(relatedOriginalPrice, relatedEffectiveDiscount) : relatedOriginalPrice;

            relatedVariant.displaySalePrice = Math.min(relatedManualSalePrice, relatedOfferSalePrice) || relatedOriginalPrice;
            relatedVariant.offerDiscount = relatedEffectiveDiscount > 0 ? relatedEffectiveDiscount : 0;
        }

        const cart = await Cart.findOne({ user: req.session.user._id });
        const cartItems = cart ? cart.items.map(item => ({
            product: item.product.toString(),
            variantIndex: item.variantIndex,
            quantity: item.quantity
        })) : [];

        const selectedVariantIndex = 0;

        res.render("user/product-detail", { 
            product, 
            relatedProducts, 
            cartItems, 
            user: req.session.user,
            selectedVariantIndex
        });
    } catch (error) {
        console.error('[PRODUCT] Error in getProductDetails:', error);
        res.status(500).render("user/page-404", { message: "Server Error" });
    }
};

module.exports = {
    getShopPage,
    getProductDetails,
    getMenPage,
    getWomenPage,
};