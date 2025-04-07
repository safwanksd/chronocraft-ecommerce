// middlewares/multer.js

const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

// Memory storage configuration for product image uploads
const storage = multer.memoryStorage();

const uploadProduct = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'), false);
        }
    },
    limits: { files: 50 }
}).any();

// Processes uploaded product images and uploads them to Cloudinary
const processProductImages = async (req, res, next) => {
    if (!req.files || req.files.length === 0) {
        req.processedImages = {};
        return next();
    }

    try {
        const processedImages = {};

        for (const file of req.files) {
            const match = file.fieldname.match(/variantImages\[(\d+)\]/);
            if (match) {
                const variantIndex = parseInt(match[1]);
                if (!processedImages[variantIndex]) {
                    processedImages[variantIndex] = [];
                }

                if (processedImages[variantIndex].length >= 5) {
                    return res.status(400).json({
                        success: false,
                        message: `Maximum 5 images allowed per variant (Variant ${variantIndex + 1})`
                    });
                }

                const stream = new Readable();
                stream.push(file.buffer);
                stream.push(null);

                let uploadResult;
                try {
                    uploadResult = await new Promise((resolve, reject) => {
                        const uploadStream = cloudinary.uploader.upload_stream(
                            {
                                folder: 'products',
                                resource_type: 'image',
                                transformation: [
                                    { width: 800, quality: 80, crop: 'scale' }
                                ]
                            },
                            (error, result) => {
                                if (error) {
                                    reject(error);
                                } else {
                                    resolve(result);
                                }
                            }
                        );
                        stream.pipe(uploadStream);
                    });
                    processedImages[variantIndex].push(uploadResult.secure_url);
                } catch (uploadError) {
                    return res.status(500).json({
                        success: false,
                        message: `Failed to upload image for Variant ${variantIndex + 1}: ${uploadError.message}`
                    });
                }
            }
        }

        req.processedImages = processedImages;
        next();
    } catch (error) {
        console.error('❌ Image Processing Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Error processing images' });
    }
};

// Disk storage configuration for profile image uploads
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/profiles');
    },
    filename: (req, file, cb) => {
        cb(null, `profile-${Date.now()}-${file.originalname}`);
    }
});

const uploadProfile = multer({
    storage: profileStorage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'), false);
        }
    },
    limits: { fileSize: 2 * 1024 * 1024 }
}).single('profileImage');

module.exports = { 
    uploadProduct, 
    processProductImages, 
    uploadProfile 
};