// controllers/admin/productController.js

const Product = require("../../models/productSchema");
const Brand = require("../../models/brandSchema");
const Category = require("../../models/categorySchema");
const cloudinary = require('../../config/cloudinary');

// Retrieves a paginated list of products with search functionality
const getProducts = async (req, res) => {
    try {
        let { search = '', page = 1 } = req.query;
        const limit = 5;
        page = parseInt(page);

        const skip = (page - 1) * limit;

        const filter = { productName: { $regex: search, $options: 'i' } };
        
        const products = await Product.find(filter)
            .populate('category', 'name')
            .populate('brand', 'brandName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);

        const productsWithNumbers = products.map((product, index) => {
            if (!product.variants || product.variants.length === 0) {
                product.variants = [{ price: 'N/A', stock: 'N/A', productImages: [] }];
            }
            product.productNumber = skip + index + 1;
            return product;
        });

        res.render('admin/products', {
            products: productsWithNumbers,
            currentPage: page,
            totalPages,
            totalProducts,
            search,
            limit
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error fetching products:', error);
        res.status(500).send('Server Error');
    }
};

// Renders the page to add a new product with available categories and brands
const getAddProductPage = async (req, res) => {
    try {
        const categories = await Category.find({});
        const brands = await Brand.find({});
        res.render('admin/add-product', { categories, brands });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error loading add product page:', error);
        res.status(500).send('Server Error');
    }
};

// Processes the creation of a new product with variants and images
const addProduct = async (req, res) => {
    try {
        const { productName, description, category, brand } = req.body;

        const variants = [];
        const variantNames = Array.isArray(req.body['variantName']) ? req.body['variantName'] : [req.body['variantName']];
        const variantColors = Array.isArray(req.body['variantColor']) ? req.body['variantColor'] : [req.body['variantColor']];
        const variantPrices = Array.isArray(req.body['variantPrice']) ? req.body['variantPrice'] : [req.body['variantPrice']];
        const variantSalePrices = Array.isArray(req.body['variantSalePrice']) ? req.body['variantSalePrice'] : [req.body['variantSalePrice']];
        const variantStocks = Array.isArray(req.body['variantStock']) ? req.body['variantStock'] : [req.body['variantStock']];

        const variantCount = Math.max(
            variantNames.length,
            variantColors.length,
            variantPrices.length,
            variantSalePrices.length,
            variantStocks.length
        );

        // Validate images and data for each variant
        for (let i = 0; i < variantCount; i++) {
            const images = req.processedImages && req.processedImages[i] ? req.processedImages[i] : [];
            if (images.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: `At least one image is required for each variant (Variant ${i + 1})`
                });
            }
            if (images.length > 5) {
                return res.status(400).json({
                    success: false,
                    message: `Maximum 5 images allowed per variant (Variant ${i + 1})`
                });
            }

            const price = parseFloat(variantPrices[i]);
            const salePrice = parseFloat(variantSalePrices[i] || price);
            const stock = parseInt(variantStocks[i]);
            const colorName = variantNames[i] || '';
            const color = variantColors[i] || '#000000';

            if (!colorName) {
                return res.status(400).json({ success: false, message: `Variant name is required for variant ${i + 1}` });
            }
            if (isNaN(price) || price <= 0) {
                return res.status(400).json({ success: false, message: `Invalid price for variant ${i + 1}` });
            }
            if (isNaN(salePrice) || salePrice > price) {
                return res.status(400).json({ success: false, message: `Sale price must be valid and not exceed original price for variant ${i + 1}` });
            }

            variants.push({
                colorName,
                color,
                price,
                salePrice,
                stock: isNaN(stock) ? 0 : stock,
                productImages: images
            });
        }

        const newProduct = new Product({
            productName,
            description,
            category,
            brand,
            variants
        });

        const savedProduct = await newProduct.save();
        if (!savedProduct) return res.status(400).json({ success: false, message: 'Failed to add product' });

        res.json({ success: true, message: 'Product added successfully', product: savedProduct });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error in addProduct:', error);
        res.status(500).json({ success: false, message: error.message || 'Error adding product' });
    }
};

// Renders the page to edit an existing product
const getEditProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId).populate('category').populate('brand');
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        const categories = await Category.find({});
        const brands = await Brand.find({});
        res.render('admin/edit-product', { product, categories, brands });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error in getEditProduct:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Updates an existing product with new data and variants
const updateProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const { productName, description, category, brand } = req.body;

        const existingProduct = await Product.findById(productId);
        if (!existingProduct) return res.status(404).json({ success: false, message: 'Product not found' });

        const variants = [];
        const variantNames = Array.isArray(req.body['variantName']) ? req.body['variantName'] : [req.body['variantName']];
        const variantColors = Array.isArray(req.body['variantColor']) ? req.body['variantColor'] : [req.body['variantColor']];
        const variantPrices = Array.isArray(req.body['variantPrice']) ? req.body['variantPrice'] : [req.body['variantPrice']];
        const variantSalePrices = Array.isArray(req.body['variantSalePrice']) ? req.body['variantSalePrice'] : [req.body['variantSalePrice']];
        const variantStocks = Array.isArray(req.body['variantStock']) ? req.body['variantStock'] : [req.body['variantStock']];

        const formVariantCount = Math.max(
            variantNames.length,
            variantColors.length,
            variantPrices.length,
            variantSalePrices.length,
            variantStocks.length
        );

        // Validate images and data for each variant
        for (let i = 0; i < formVariantCount; i++) {
            const existingVariant = existingProduct.variants[i] || {};
            const existingImages = existingVariant.productImages || [];
            const newImages = req.processedImages && req.processedImages[i] ? req.processedImages[i] : [];
            const allImages = [...existingImages, ...newImages].slice(0, 5);

            if (allImages.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: `At least one image is required for each variant (Variant ${i + 1})`
                });
            }
            if (allImages.length > 5) {
                return res.status(400).json({
                    success: false,
                    message: `Maximum 5 images allowed per variant (Variant ${i + 1})`
                });
            }

            const price = parseFloat(variantPrices[i] || existingVariant.price || 0);
            const salePrice = parseFloat(variantSalePrices[i] || existingVariant.salePrice || price);
            const stockValue = parseInt(variantStocks[i]);
            const stock = isNaN(stockValue) ? (existingVariant.stock || 0) : stockValue;
            const colorName = variantNames[i] || existingVariant.colorName || '';
            const color = variantColors[i] || existingVariant.color || '#000000';

            if (!colorName) {
                return res.status(400).json({ success: false, message: `Variant name is required for variant ${i + 1}` });
            }
            if (isNaN(price) || price <= 0) {
                return res.status(400).json({ success: false, message: `Invalid price for variant ${i + 1}` });
            }
            if (isNaN(salePrice) || salePrice > price) {
                return res.status(400).json({ success: false, message: `Sale price must be valid and not exceed original price for variant ${i + 1}` });
            }

            variants.push({
                colorName,
                color,
                price,
                salePrice,
                stock,
                productImages: allImages
            });
        }

        // Delete images from Cloudinary for removed variants
        if (existingProduct.variants.length > formVariantCount) {
            for (let i = formVariantCount; i < existingProduct.variants.length; i++) {
                const variant = existingProduct.variants[i];
                if (variant.productImages && variant.productImages.length > 0) {
                    for (const imageUrl of variant.productImages) {
                        const publicIdMatch = imageUrl.match(/\/products\/(.+)\.\w+$/);
                        if (publicIdMatch) {
                            const publicId = `products/${publicIdMatch[1]}`;
                            await cloudinary.uploader.destroy(publicId).catch(err => {
                                console.error(`Failed to delete image from Cloudinary: ${publicId}`, err);
                            });
                        }
                    }
                }
            }
        }

        existingProduct.productName = productName;
        existingProduct.description = description;
        existingProduct.category = category;
        existingProduct.brand = brand;
        existingProduct.variants = variants;
        const updatedProduct = await existingProduct.save();

        if (!updatedProduct) return res.status(404).json({ success: false, message: 'Failed to update product' });

        res.json({ success: true, message: 'Product updated successfully', product: updatedProduct });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error in updateProduct:', error);
        res.status(500).json({ success: false, message: error.message || 'Error updating product' });
    }
};

// Deletes a product from the database
const deleteProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const deletedProduct = await Product.findByIdAndDelete(productId);
        if (!deletedProduct) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error deleting product:', error);
        res.status(500).json({ success: false, message: 'Failed to delete product' });
    }
};

// Updates the block status of a product
const updateProductStatus = async (req, res) => {
    try {
        const productId = req.params.id;
        const { isBlocked } = req.body;
        const product = await Product.findByIdAndUpdate(productId, { isBlocked }, { new: true });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, message: 'Product status updated successfully' });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error updating product status:', error);
        res.status(500).json({ success: false, message: 'Failed to update product status' });
    }
};

// Deletes a specific image from a product variant
const deleteVariantImage = async (req, res) => {
    try {
        const { productId, variantIndex, imageIndex } = req.params;
        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        const variant = product.variants[variantIndex];
        if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

        const imageUrl = variant.productImages[parseInt(imageIndex)];
        if (!imageUrl) return res.status(404).json({ success: false, message: 'Image not found' });

        // Extract Cloudinary public ID from the URL
        const publicIdMatch = imageUrl.match(/\/products\/(.+)\.\w+$/);
        if (publicIdMatch) {
            const publicId = `products/${publicIdMatch[1]}`;
            await cloudinary.uploader.destroy(publicId);
        }

        variant.productImages.splice(parseInt(imageIndex), 1);
        await product.save();

        res.json({ success: true, message: 'Image deleted successfully' });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error deleting image:', error);
        res.status(500).json({ success: false, message: 'Failed to delete image' });
    }
};

module.exports = {
    getProducts,
    getAddProductPage,
    addProduct,
    getEditProduct,
    updateProduct,
    deleteProduct,
    updateProductStatus,
    deleteVariantImage
};