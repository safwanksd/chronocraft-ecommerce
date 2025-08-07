// controllers/admin/couponController.js
const Coupon = require('../../models/couponSchema');

// Middleware to validate ObjectId
const validateObjectId = (req, res, next) => {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).render('admin/error', { message: 'Invalid coupon ID format.' });
    }
    next();
};


// Get coupon management
const getCouponManagement = async (req, res) => {
    try {
        const search = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        let query = {};

        // Apply search
        if (search) {
            query.code = { $regex: search, $options: 'i' };
        }

        const totalCoupons = await Coupon.countDocuments(query);
        const totalPages = Math.ceil(totalCoupons / limit);
        const coupons = await Coupon.find(query).skip(skip).limit(limit).sort({ createdAt: -1 });

        console.log('[COUPON] Fetched coupons:', coupons);

        res.render('admin/coupons', { 
            coupons, 
            search, 
            currentPage: page, 
            totalPages, 
            limit, 
            totalCoupons 
        });
    } catch (error) {
        console.error('[COUPON] Error fetching coupons:', error);
        res.status(500).render('admin/error', { message: 'Server error while fetching coupons.' });
    }
};

// Load edit page
const getAddCouponPage = (req, res) => {
    res.render('admin/add-coupon');
};

// Edit coupon page
const getEditCouponPage = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).render('admin/error', { message: 'Coupon not found.' });
        }
        res.render('admin/edit-coupon', { coupon });
    } catch (error) {
        console.error('[COUPON] Error fetching coupon for edit:', error);
        res.status(500).render('admin/error', { message: 'Server error while fetching coupon.' });
    }
};


//Create coupon
const createCoupon = async (req, res) => {
    try {
        const { code, description, discountType, discountValue, minPurchaseAmount, maxDiscountAmount, validFrom, validUntil, usageLimit, perUserLimit, isActive } = req.body;

        // Validate required fields
        if (!code || !discountType || !discountValue || !minPurchaseAmount || !maxDiscountAmount || !validFrom || !validUntil) {
            return res.status(400).json({ success: false, message: 'All required fields must be filled.' });
        }

        // Validate discount value
        if (discountType === 'percentage' && (discountValue > 90 || discountValue < 0)) {
            return res.status(400).json({ success: false, message: 'Percentage discount must be between 0 and 90%.' });
        }

        // Validate purchase amounts
        const minPurchase = parseFloat(minPurchaseAmount);
        const maxDiscount = parseFloat(maxDiscountAmount);
        if (isNaN(minPurchase) || minPurchase < 1) {
            return res.status(400).json({ success: false, message: 'Minimum purchase amount must be a number and at least 1.' });
        }
        if (isNaN(maxDiscount) || maxDiscount < 1) {
            return res.status(400).json({ success: false, message: 'Maximum discount amount must be a number and at least 1.' });
        }
        if (maxDiscount >= minPurchase) {
            return res.status(400).json({ success: false, message: 'Maximum discount amount must be less than minimum purchase amount.' });
        }

        // Validate dates
        const startDate = new Date(validFrom);
        const endDate = new Date(validUntil);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid date format. Please use YYYY-MM-DD.' });
        }
        if (startDate >= endDate) {
            return res.status(400).json({ success: false, message: 'Valid Until must be after Valid From.' });
        }

        // Check if code already exists
        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).json({ success: false, message: `Coupon code '${code.toUpperCase()}' already exists.` });
        }

        const newCoupon = new Coupon({
            code: code.toUpperCase(),
            description,
            discountType,
            discountValue,
            minPurchaseAmount: minPurchase,
            maxDiscountAmount: maxDiscount,
            validFrom: startDate.toISOString().split('T')[0],
            validUntil: endDate.toISOString().split('T')[0],
            usageLimit: usageLimit ? parseInt(usageLimit) : null,
            perUserLimit: parseInt(perUserLimit) || 1,
            isActive: Boolean(isActive)
        });

        await newCoupon.save();
        res.status(201).json({ success: true, message: 'Coupon created successfully!' });
    } catch (error) {
        console.error('[COUPON] Error creating coupon:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: `Coupon code '${error.keyValue.code}' already exists.` });
        }
        if (error.message.includes('Maximum discount amount must be less than minimum purchase amount')) {
            return res.status(400).json({ success: false, message: 'Maximum discount amount must be less than minimum purchase amount.' });
        }
        res.status(500).json({ success: false, message: 'Server error while creating coupon.' });
    }
};

// Update coupon
const updateCoupon = async (req, res) => {
    try {
        const { code, description, discountType, discountValue, minPurchaseAmount, maxDiscountAmount, validFrom, validUntil, usageLimit, perUserLimit, isActive } = req.body;
        const couponId = req.params.id;

        // Validate required fields
        if (!code || !discountType || !discountValue || !minPurchaseAmount || !maxDiscountAmount || !validFrom || !validUntil) {
            return res.status(400).json({ success: false, message: 'All required fields must be filled.' });
        }

        // Validate discount value
        if (discountType === 'percentage' && (discountValue > 90 || discountValue < 0)) {
            return res.status(400).json({ success: false, message: 'Percentage discount must be between 0 and 90%.' });
        }

        // Validate purchase amounts
        const minPurchase = parseFloat(minPurchaseAmount);
        const maxDiscount = parseFloat(maxDiscountAmount);
        if (isNaN(minPurchase) || minPurchase < 1) {
            return res.status(400).json({ success: false, message: 'Minimum purchase amount must be a number and at least 1.' });
        }
        if (isNaN(maxDiscount) || maxDiscount < 1) {
            return res.status(400).json({ success: false, message: 'Maximum discount amount must be a number and at least 1.' });
        }
        if (maxDiscount >= minPurchase) {
            console.log('[COUPON] Validation failed: maxDiscount', maxDiscount, '>= minPurchase', minPurchase);
            return res.status(400).json({ success: false, message: 'Maximum discount amount must be less than minimum purchase amount.' });
        }

        // Validate dates
        const startDate = new Date(validFrom);
        const endDate = new Date(validUntil);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid date format. Please use YYYY-MM-DD.' });
        }
        if (startDate >= endDate) {
            return res.status(400).json({ success: false, message: 'Valid Until must be after Valid From.' });
        }

        // Check if code already exists 
        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase(), _id: { $ne: couponId } });
        if (existingCoupon) {
            return res.status(400).json({ success: false, message: `Coupon code '${code.toUpperCase()}' already exists.` });
        }

        // Update the coupon with provided fields
        const updateData = {
            code: code.toUpperCase(),
            description,
            discountType,
            discountValue,
            minPurchaseAmount: minPurchase,
            maxDiscountAmount: maxDiscount,
            validFrom: startDate.toISOString().split('T')[0],
            validUntil: endDate.toISOString().split('T')[0],
            usageLimit: usageLimit ? parseInt(usageLimit) : null,
            perUserLimit: parseInt(perUserLimit) || 1,
            isActive: Boolean(isActive)
        };

        const updatedCoupon = await Coupon.findByIdAndUpdate(
            couponId,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedCoupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found.' });
        }
        res.json({ success: true, message: 'Coupon updated successfully!' });
    } catch (error) {
        console.error('[COUPON] Error updating coupon:', error);
        if (error.message.includes('Maximum discount amount must be less than minimum purchase amount')) {
            return res.status(400).json({ success: false, message: 'Maximum discount amount must be less than minimum purchase amount.' });
        }
        res.status(500).json({ success: false, message: 'Server error while updating coupon.' });
    }
};

// Delete coupon
const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findByIdAndUpdate(id, { isActive: false }, { new: true });
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found.' });
        }
        res.json({ success: true, message: 'Coupon deleted successfully.' });
    } catch (error) {
        console.error('[COUPON] Error deleting coupon:', error);
        res.status(500).json({ success: false, message: 'Server error while deleting coupon.' });
    }
};

module.exports = { 
    getCouponManagement, 
    getEditCouponPage, 
    createCoupon, 
    updateCoupon, 
    deleteCoupon, 
    validateObjectId,
    getAddCouponPage
};