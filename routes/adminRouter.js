// routes/adminRouter.js

const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const { uploadBrand, resizeBrandImage, uploadProduct, processProductImages } = require("../middlewares/multer");
const adminAuth = require("../middlewares/adminAuth");
const userController = require("../controllers/admin/userController");
const categoryController = require("../controllers/admin/categoryController");
const brandController = require("../controllers/admin/brandController");
const adminOrderController = require("../controllers/admin/orderController");

const productController = require("../controllers/admin/productController");


// ===========================
// 🔹 Admin Authentication Routes
// ===========================
router.get("/login", adminController.getLoginPage);
router.post("/login", adminController.postLogin);
router.get("/dashboard", adminAuth, adminController.getDashboard);
router.get("/logout", adminController.logout);

// ===========================
// 🔹 Category Management Routes
// ===========================
router.get("/categories", categoryController.getCategories);
router.post("/categories/add", categoryController.addCategory);
router.get("/categories/edit/:id", categoryController.getEditCategoryPage);
router.put("/categories/edit/:id", categoryController.editCategory);
router.post('/categories/update-status/:id', categoryController.updateCategoryStatus);
// router.post('/categories/edit', categoryController.editCategory);
// ===========================
// 🔹 User Management Routes
// ===========================
router.get("/users", adminAuth, userController.getUsers);
router.post("/users/block/:id", adminAuth, userController.blockUser);
router.post("/users/unblock/:id", adminAuth, userController.unblockUser);

// ===========================
// 🔹 Brand Management Routes
// =========================== 
router.get("/brands", brandController.getBrands);
router.post("/brands/add", brandController.addBrand);
router.post("/brands/edit", brandController.editBrand);
router.post("/brands/delete", brandController.deleteBrand);
router.post("/brands/block-unblock", brandController.toggleBrandStatus);
router.get("/brands/edit/:id", brandController.getEditBrandPage);


router.get("/products", adminAuth, productController.getProducts);
router.get("/products/add", adminAuth, productController.getAddProductPage);
router.get('/products/edit/:id', adminAuth, productController.getEditProduct);

// Add product route
router.post(
    "/products/add",
    adminAuth,
    uploadProduct,
    processProductImages,
    productController.addProduct
);

// edit product route

router.put('/products/edit/:id', adminAuth, uploadProduct, processProductImages, productController.updateProduct);

// delete variant image
router.delete('/products/:productId/variant/:variantIndex/image/:imageIndex', adminAuth, productController.deleteVariantImage);

// Delete product route
router.delete('/products/delete/:id', adminAuth, productController.deleteProduct);

// Update product status route
router.patch('/products/update-status/:id', adminAuth, productController.updateProductStatus);


// Order Management Routes
router.get("/orders", adminAuth, adminOrderController.getOrders);
router.post("/orders/:orderId/status", adminAuth, adminOrderController.updateOrderStatus);
router.post("/returns/:returnId/verify", adminAuth, adminOrderController.verifyReturnRequest);
router.get("/orders/clear", adminAuth, adminOrderController.clearSearch);
router.get("/orders/:orderId", adminAuth, adminOrderController.getOrderDetails);

module.exports = router;
