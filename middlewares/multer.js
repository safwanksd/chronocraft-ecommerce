// middlewares/multer.js
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/products');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const uploadProduct = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'), false);
        }
    },
    limits: { files: 5 }
}).any();

const processProductImages = async (req, res, next) => {
    if (!req.files || req.files.length === 0) {
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

                const outputFilename = `processed-${Date.now()}-${file.filename}`;
                const outputPath = path.join('public', 'uploads', 'products', outputFilename); // Full file system path
                const webPath = `/uploads/products/${outputFilename}`; // Web-friendly path

                await require('sharp')(file.path)
                    .resize({ width: 800 })
                    .jpeg({ quality: 80 })
                    .toFile(outputPath);

                setTimeout(() => {
                    require('fs').unlink(file.path, (err) => {
                        if (err) console.error(`Failed to delete: ${file.path}`, err);
                    });
                }, 500);

                processedImages[variantIndex].push(webPath); // Store web-friendly path
            }
        }

        req.processedImages = processedImages;
        next();
    } catch (error) {
        console.error('Image Processing Error:', error);
        res.status(500).json({ success: false, message: 'Error processing images' });
    }
};

const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/profiles'); // New folder for profile pics
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
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
}).single('profileImage');

module.exports = { uploadProduct, processProductImages, uploadProfile };