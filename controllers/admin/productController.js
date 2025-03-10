// controller/admin/productController.js
const Product = require("../../models/productSchema");
const Brand = require("../../models/brandSchema");
const Category = require("../../models/categorySchema");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// Image processing middleware
const processImages = async (req, res, next) => {
    console.log("🛠 Processing Images Middleware Called...");

    if (!req.files || req.files.length === 0) {
        console.error("❌ No images uploaded!");
        return res.status(400).json({ error: "No images uploaded" });
    }

    try {
        const processedImages = [];

        for (const file of req.files) {
            const outputFilename = `processed-${Date.now()}-${file.filename}`;
            const outputPath = path.join(file.destination, outputFilename);

            console.log(`🔄 Processing image: ${file.filename} -> ${outputFilename}`);

            await sharp(file.path)
                .resize({ width: 800 })
                .jpeg({ quality: 80 })
                .toFile(outputPath);

            setTimeout(() => {
                fs.unlink(file.path, (err) => {
                    if (err) console.error(`❌ Failed to delete original image: ${file.path}`, err);
                    else console.log(`✅ Deleted original image: ${file.path}`);
                });
            }, 500);

            processedImages.push(outputFilename);
        }

        console.log("📸 Processed Images:", processedImages);
        req.processedImages = processedImages; // Store processed images in req

        next();
    } catch (error) {
        console.error("❌ Image Processing Error:", error);
        return res.status(500).json({ error: "Error processing images" });
    }
};

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
        console.error('Error fetching products:', error);
        res.status(500).send('Server Error');
    }
};

const getAddProductPage = async (req, res) => {
    try {
        const categories = await Category.find({});
        const brands = await Brand.find({});
        res.render('admin/add-product', { categories, brands });
    } catch (error) {
        console.error('Error loading add product page:', error);
        res.status(500).send('Server Error');
    }
};

const addProduct = async (req, res) => {
    try {
        console.log('🚀 Received Product Data:', req.body);
        console.log('📸 Processed Images:', req.processedImages);

        const { productName, description, category, brand } = req.body;

        if (!productName || !description || !category || !brand) {
            return res.status(400).json({ success: false, message: 'All fields are required!' });
        }

        const variants = [];
        const variantNames = Array.isArray(req.body['variantName']) ? req.body['variantName'] : [req.body['variantName']];
        const variantColors = Array.isArray(req.body['variantColor']) ? req.body['variantColor'] : [req.body['variantColor']];
        const variantPrices = Array.isArray(req.body['variantPrice']) ? req.body['variantPrice'] : [req.body['variantPrice']];
        const variantSalePrices = Array.isArray(req.body['variantSalePrice']) ? req.body['variantSalePrice'] : [req.body['variantSalePrice'] || []];
        const variantStocks = Array.isArray(req.body['variantStock']) ? req.body['variantStock'] : [req.body['variantStock']];

        for (let i = 0; i < Math.max(variantNames.length, variantPrices.length); i++) {
            const images = req.processedImages && req.processedImages[i] ? req.processedImages[i] : [];
            if (images.length === 0) {
                return res.status(400).json({ success: false, message: `At least one image required for variant ${i + 1}` });
            }

            const price = parseFloat(variantPrices[i]);
            const salePrice = parseFloat(variantSalePrices[i]) || price; // Default to price if salePrice is undefined or invalid
            if (isNaN(price)) {
                return res.status(400).json({ success: false, message: `Invalid price for variant ${i + 1}` });
            }
            if (!isNaN(salePrice) && salePrice > price) {
                return res.status(400).json({ success: false, message: `Sale price cannot exceed original price for variant ${i + 1}` });
            }

            variants.push({
                colorName: variantNames[i] || '',
                color: variantColors[i] || '#000000',
                price: price,
                salePrice: isNaN(salePrice) ? price : salePrice, // Ensure salePrice is valid, default to price
                stock: parseInt(variantStocks[i]) || 0,
                productImages: images
            });
        }

        console.log('📦 Variants to Save:', variants); // Debug log

        const newProduct = new Product({
            productName,
            description,
            category,
            brand,
            variants
        });

        await newProduct.save();
        res.json({ success: true, message: 'Product added successfully!', product: newProduct });
    } catch (error) {
        console.error('❌ Error adding product:', error);
        res.status(500).json({ success: false, message: error.message || 'Error adding product' });
    }
};

const getEditProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId).populate('category').populate('brand');
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        const categories = await Category.find({});
        const brands = await Brand.find({});
        res.render('admin/edit-product', { product, categories, brands });
    } catch (error) {
        console.error('Error in getEditProduct:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const updateProduct = async (req, res) => {
    try {
        console.log("🟢 Update Product Route Hit! Product ID:", req.params.id);
        console.log("📩 Raw Received Data (req.body):", req.body);
        console.log("📸 Processed Images:", req.processedImages);

        const productId = req.params.id;
        const { productName, description, category, brand } = req.body;

        const existingProduct = await Product.findById(productId);
        if (!existingProduct) return res.status(404).json({ success: false, message: 'Product not found' });

        const variants = [];
        const variantNames = Array.isArray(req.body['variantName']) ? req.body['variantName'] : [req.body['variantName']];
        const variantColors = Array.isArray(req.body['variantColor']) ? req.body['variantColor'] : [req.body['variantColor']];
        const variantPrices = Array.isArray(req.body['variantPrice']) ? req.body['variantPrice'] : [req.body['variantPrice']];
        const variantSalePrices = Array.isArray(req.body['variantSalePrice']) ? req.body['variantSalePrice'] : [req.body['variantSalePrice'] || []];
        const variantStocks = Array.isArray(req.body['variantStock']) ? req.body['variantStock'] : [req.body['variantStock']];

        const maxLength = Math.max(
            variantNames.length,
            variantColors.length,
            variantPrices.length,
            variantSalePrices.length,
            variantStocks.length,
            existingProduct.variants.length
        );

        for (let i = 0; i < maxLength; i++) {
            const existingVariant = existingProduct.variants[i] || {};
            const existingImages = existingVariant.productImages || [];
            const newImages = req.processedImages && req.processedImages[i] ? req.processedImages[i] : [];
            const allImages = [...existingImages, ...newImages].slice(0, 5);

            const price = parseFloat(variantPrices[i] || existingVariant.price || 0);
            const salePrice = parseFloat(variantSalePrices[i]) || parseFloat(existingVariant.salePrice) || price; // Preserve existing salePrice or default to price
            const stock = parseInt(variantStocks[i]) || existingVariant.stock || 0;
            const colorName = variantNames[i] || existingVariant.colorName || '';
            const color = variantColors[i] || existingVariant.color || '#000000';

            if (isNaN(price)) {
                return res.status(400).json({ success: false, message: `Invalid price for variant ${i + 1}` });
            }
            if (!isNaN(salePrice) && salePrice > price) {
                return res.status(400).json({ success: false, message: `Sale price cannot exceed original price for variant ${i + 1}` });
            }

            variants.push({
                colorName,
                color,
                price,
                salePrice: isNaN(salePrice) ? price : salePrice, // Ensure salePrice is valid
                stock,
                productImages: allImages
            });
        }

        console.log('📦 Variants to Update:', variants); // Debug log

        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            { productName, description, category, brand, variants, updatedAt: Date.now() },
            { new: true }
        );

        if (!updatedProduct) return res.status(404).json({ success: false, message: 'Failed to update product' });

        res.json({ success: true, message: 'Product updated successfully', product: updatedProduct });
    } catch (error) {
        console.error('Error in updateProduct:', error);
        res.status(500).json({ success: false, message: error.message || 'Error updating product' });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const deletedProduct = await Product.findByIdAndDelete(productId);
        if (!deletedProduct) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ success: false, message: 'Failed to delete product' });
    }
};

const updateProductStatus = async (req, res) => {
    try {
        const productId = req.params.id;
        const { isBlocked } = req.body;
        const product = await Product.findByIdAndUpdate(productId, { isBlocked }, { new: true });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, message: 'Product status updated successfully' });
    } catch (error) {
        console.error('Error updating product status:', error);
        res.status(500).json({ success: false, message: 'Failed to update product status' });
    }
};

const deleteVariantImage = async (req, res) => {
    try {
        const { productId, variantIndex, imageIndex } = req.params;
        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        const variant = product.variants[variantIndex];
        if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

        variant.productImages.splice(parseInt(imageIndex), 1);
        await product.save();

        res.json({ success: true, message: 'Image deleted successfully' });
    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({ success: false, message: 'Failed to delete image' });
    }
};

module.exports = {
    getProducts,
    getAddProductPage,
    addProduct,
    processImages,
    getEditProduct,
    updateProduct,
    deleteProduct,
    updateProductStatus,
    deleteVariantImage
};