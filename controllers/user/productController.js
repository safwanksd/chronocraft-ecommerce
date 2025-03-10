// controllers/user/productController.js
const Product = require("../../models/productSchema");
const Brand = require("../../models/brandSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema");

const getShopPage = async (req, res) => {
    console.log('[PRODUCT] Entering getShopPage');
    try {
        console.log('[PRODUCT] Query Params:', req.query);
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
            console.log('[PRODUCT] Applying search filter:', search);
        }
        if (category) {
            const selectedCategory = await Category.findOne({ _id: category, isListed: true });
            if (!selectedCategory) {
                filter.category = null;
                console.log('[PRODUCT] Category unlisted:', category);
            } else {
                filter.category = category;
                console.log('[PRODUCT] Applying category filter:', category);
            }
        }
        if (brand) {
            const selectedBrand = await Brand.findOne({ _id: brand, isBlocked: false });
            if (!selectedBrand) {
                filter.brand = null;
                console.log('[PRODUCT] Brand blocked:', brand);
            } else {
                filter.brand = brand;
                console.log('[PRODUCT] Applying brand filter:', brand);
            }
        }

        console.log('[PRODUCT] Final Filter:', filter);

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
        console.log('[PRODUCT] Sort Option:', sortOption);

        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);
        console.log('[PRODUCT] Total Products:', totalProducts, 'Total Pages:', totalPages);

        const products = await Product.find(filter)
            .populate("category", "name")
            .populate("brand", "brandName")
            .sort(sortOption)
            .skip(skip)
            .limit(limit);
        console.log('[PRODUCT] Products Fetched:', products.length);

        if (req.xhr || req.headers.accept.includes('json')) {
            const productsHTML = products.map(product => {
                const variant = product.variants[0] || {};
                const salePrice = variant.salePrice || variant.price || 0;
                const price = variant.price || 0;
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
                                <p class="card-text text-gray mb-2">${product.brand.brandName} | ${product.category.name}</p>
                                <p class="card-text mb-3">
                                    <strong class="text-dark">₹${salePrice.toLocaleString('en-IN')}</strong>
                                    ${salePrice < price ? `
                                        <span class="original-price text-muted ms-2"><s>₹${price.toLocaleString('en-IN')}</s></span>
                                    ` : ''}
                                </p>
                                <a href="/user/product-detail/${product._id}" class="btn btn-black mt-auto">View Details</a>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            console.log('[PRODUCT] Returning AJAX response');
            return res.send(productsHTML);
        }

        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isBlocked: false });
        console.log('[PRODUCT] Categories Fetched:', categories.length, 'Brands Fetched:', brands.length);

        res.render("user/shop", { 
            products,
            categories,
            brands,
            currentFilters: { search, sort, category, brand },
            currentPage: parseInt(page),
            totalPages
        });
        console.log('[PRODUCT] Shop page rendered');
    } catch (error) {
        console.error('[PRODUCT] Error in getShopPage:', error);
        if (req.xhr) {
            return res.status(500).send('<div class="col-12 text-center"><p class="text-danger">Error loading products. Please try again.</p></div>');
        }
        res.status(500).render("error", { message: "Server Error" });
    }
};

const getMenPage = async (req, res) => {
    console.log('[PRODUCT] Entering getMenPage');
    try {
        console.log('[PRODUCT] Query Params:', req.query);
        const { sort = "", brand = "", page = 1 } = req.query;
        const limit = 4;
        const skip = (parseInt(page) - 1) * limit;

        const menCategory = await Category.findOne({ name: "Men", isListed: true });
        if (!menCategory) {
            console.log('[PRODUCT] Men category not found or unlisted');
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
                console.log('[PRODUCT] Brand blocked:', brand);
            } else {
                filter.brand = brand;
                console.log('[PRODUCT] Applying brand filter:', brand);
            }
        }

        console.log('[PRODUCT] Final Filter for Men:', filter);

        let sortOption = {};
        switch (sort) {
            case "low-high": sortOption = { "variants.0.salePrice": 1 }; break;
            case "high-low": sortOption = { "variants.0.salePrice": -1 }; break;
            case "name-asc": sortOption = { productName: 1 }; break;
            case "name-desc": sortOption = { productName: -1 }; break;
            default: sortOption = { createdAt: -1 };
        }
        console.log('[PRODUCT] Sort Option:', sortOption);

        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);
        console.log('[PRODUCT] Total Products:', totalProducts, 'Total Pages:', totalPages);

        const products = await Product.find(filter)
            .populate("category", "name")
            .populate("brand", "brandName")
            .sort(sortOption)
            .skip(skip)
            .limit(limit);
        console.log('[PRODUCT] Products Fetched:', products.length);

        if (req.xhr || req.headers.accept.includes('json')) {
            const productsHTML = products.map(product => {
                const variant = product.variants[0] || {};
                const salePrice = variant.salePrice || variant.price || 0;
                const price = variant.price || 0;
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
                                    ${salePrice < price ? `
                                        <span class="original-price text-muted ms-2"><s>₹${price.toLocaleString('en-IN')}</s></span>
                                    ` : ''}
                                </p>
                                <a href="/user/product-detail/${product._id}" class="btn btn-black mt-auto">View Details</a>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            console.log('[PRODUCT] Returning AJAX response');
            return res.send(productsHTML);
        }

        const brands = await Brand.find({ isBlocked: false });
        console.log('[PRODUCT] Brands Fetched:', brands.length);

        res.render("user/men", { 
            products,
            brands,
            currentFilters: { sort, brand },
            currentPage: parseInt(page),
            totalPages
        });
        console.log('[PRODUCT] Men page rendered');
    } catch (error) {
        console.error('[PRODUCT] Error in getMenPage:', error);
        if (req.xhr) {
            return res.status(500).send('<div class="col-12 text-center"><p class="text-danger">Error loading men\'s watches. Please try again.</p></div>');
        }
        res.status(500).render("error", { message: "Server Error" });
    }
};

const getWomenPage = async (req, res) => {
    console.log('[PRODUCT] Entering getWomenPage');
    try {
        console.log('[PRODUCT] Query Params:', req.query);
        const { sort = "", brand = "", page = 1 } = req.query;
        const limit = 4;
        const skip = (parseInt(page) - 1) * limit;

        const womenCategory = await Category.findOne({ name: "Women", isListed: true });
        if (!womenCategory) {
            console.log('[PRODUCT] Women category not found or unlisted');
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
                console.log('[PRODUCT] Brand blocked:', brand);
            } else {
                filter.brand = brand;
                console.log('[PRODUCT] Applying brand filter:', brand);
            }
        }

        console.log('[PRODUCT] Final Filter for Women:', filter);

        let sortOption = {};
        switch (sort) {
            case "low-high": sortOption = { "variants.0.salePrice": 1 }; break;
            case "high-low": sortOption = { "variants.0.salePrice": -1 }; break;
            case "name-asc": sortOption = { productName: 1 }; break;
            case "name-desc": sortOption = { productName: -1 }; break;
            default: sortOption = { createdAt: -1 };
        }
        console.log('[PRODUCT] Sort Option:', sortOption);

        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);
        console.log('[PRODUCT] Total Products:', totalProducts, 'Total Pages:', totalPages);

        const products = await Product.find(filter)
            .populate("category", "name")
            .populate("brand", "brandName")
            .sort(sortOption)
            .skip(skip)
            .limit(limit);
        console.log('[PRODUCT] Products Fetched:', products.length);

        if (req.xhr || req.headers.accept.includes('json')) {
            const productsHTML = products.map(product => {
                const variant = product.variants[0] || {};
                const salePrice = variant.salePrice || variant.price || 0;
                const price = variant.price || 0;
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
                                    ${salePrice < price ? `
                                        <span class="original-price text-muted ms-2"><s>₹${price.toLocaleString('en-IN')}</s></span>
                                    ` : ''}
                                </p>
                                <a href="/user/product-detail/${product._id}" class="btn btn-black mt-auto">View Details</a>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            console.log('[PRODUCT] Returning AJAX response');
            return res.send(productsHTML);
        }

        const brands = await Brand.find({ isBlocked: false });
        console.log('[PRODUCT] Brands Fetched:', brands.length);

        res.render("user/women", { 
            products,
            brands,
            currentFilters: { sort, brand },
            currentPage: parseInt(page),
            totalPages
        });
        console.log('[PRODUCT] Women page rendered');
    } catch (error) {
        console.error('[PRODUCT] Error in getWomenPage:', error);
        if (req.xhr) {
            return res.status(500).send('<div class="col-12 text-center"><p class="text-danger">Error loading women\'s watches. Please try again.</p></div>');
        }
        res.status(500).render("error", { message: "Server Error" });
    }
};

const getProductDetails = async (req, res) => {
    console.log('[PRODUCT] Entering getProductDetails:', req.params.id);
    try {
        const productId = req.params.id;
        const product = await Product.findOne({ 
            _id: productId,
            isBlocked: false,
            category: { $in: await Category.find({ isListed: true }).distinct('_id') },
            brand: { $in: await Brand.find({ isBlocked: false }).distinct('_id') }
        })
            .populate("brand", "brandName")
            .populate("category", "name");

        if (!product) {
            console.log('[PRODUCT] Product not found or unavailable:', productId);
            return res.redirect('/user/shop');
        }

        console.log('[PRODUCT] Product fetched:', product.productName);

        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: product._id },
            isBlocked: false,
            category: { $in: await Category.find({ isListed: true }).distinct('_id') },
            brand: { $in: await Brand.find({ isBlocked: false }).distinct('_id') }
        })
            .populate("brand", "brandName")
            .limit(4);

        console.log('[PRODUCT] Related products fetched:', relatedProducts.length);

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
        console.log('[PRODUCT] Product detail page rendered');
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