// routes/adminRouter.js
// Defines routes for admin-related functionality, including authentication, user management, products, orders, etc.

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
const offerController = require("../controllers/admin/offerController");
const couponController = require("../controllers/admin/couponController");
const orderController = require("../controllers/admin/orderController");
const walletController = require('../controllers/admin/walletController');

// Admin Authentication Routes
// Routes for admin authentication and dashboard
router.get("/login", adminController.getLoginPage); 
router.post("/login", adminController.postLogin); 
router.get("/dashboard", adminAuth, orderController.getDashboardStats); 
router.get("/logout", adminController.logout); 

// Category Management Routes
// Routes for managing product categories
router.get("/categories", categoryController.getCategories); 
router.post("/categories/add", categoryController.addCategory); 
router.get("/categories/edit/:id", categoryController.getEditCategoryPage); 
router.put("/categories/edit/:id", categoryController.editCategory); 
router.post('/categories/update-status/:id', categoryController.updateCategoryStatus); // Toggle category status

// User Management Routes
// Routes for managing users
router.get("/users", adminAuth, userController.getUsers); 
router.patch("/users/:id/block", adminAuth, userController.blockUser); 
router.patch("/users/:id/unblock", adminAuth, userController.unblockUser); 

// Brand Management Routes
// Routes for managing brands
router.get("/brands", adminAuth, brandController.getBrands);
router.post("/brands/add", adminAuth, brandController.addBrand); 
router.post("/brands/edit", adminAuth, brandController.editBrand); 
router.delete("/brands/:id", adminAuth, brandController.deleteBrand); 
router.patch("/brands/:id/status", adminAuth, brandController.toggleBrandStatus); 
router.get("/brands/edit/:id", adminAuth, brandController.getEditBrandPage); 

// Product Management Routes
// Routes for managing products
router.get("/products", adminAuth, productController.getProducts); 
router.get("/products/add", adminAuth, productController.getAddProductPage); 
router.get('/products/edit/:id', adminAuth, productController.getEditProduct); 
router.post("/products/add", adminAuth, uploadProduct, processProductImages, productController.addProduct); 
router.put('/products/edit/:id', adminAuth, uploadProduct, processProductImages, productController.updateProduct); 
router.delete('/products/:productId/variant/:variantIndex/image/:imageIndex', adminAuth, productController.deleteVariantImage); 
router.delete('/products/delete/:id', adminAuth, productController.deleteProduct); 
router.patch('/products/update-status/:id', adminAuth, productController.updateProductStatus); 

// Order Management Routes
// Routes for managing orders (admin side)
router.get("/orders", adminAuth, adminOrderController.getOrders); 
router.post("/orders/:orderId/status", adminAuth, adminOrderController.updateOrderStatus); 
router.post("/returns/:returnId/verify", adminAuth, adminOrderController.verifyReturnRequest); 
router.get("/orders/clear", adminAuth, adminOrderController.clearSearch); 
router.get("/orders/:orderId", adminAuth, adminOrderController.getOrderDetails); 

// Sales Report Routes
// Routes for generating sales reports
router.get('/sales-report', adminAuth, adminOrderController.getSalesReport); 
router.get('/sales-report/download/pdf', adminAuth, adminOrderController.downloadSalesReportPDF); 
router.get('/sales-report/download/excel', adminAuth, adminOrderController.downloadSalesReportExcel); 

// Offer Management Routes
// Routes for managing offers
router.get("/offers", adminAuth, offerController.getOffersPage); 
router.get("/offers/add", adminAuth, offerController.getAddOfferPage); 
router.post("/offers/add", adminAuth, offerController.addOffer); 
router.get("/offers/edit/:id", adminAuth, offerController.getEditOfferPage); 
router.put("/offers/edit/:id", adminAuth, offerController.editOffer); 
router.post("/offers/toggle-status/:id", adminAuth, offerController.toggleOfferStatus); 

// Coupon Management Routes
// Routes for managing coupons (admin side)
router.get("/coupons", adminAuth, couponController.getCouponManagement); 
router.post("/coupons", adminAuth, couponController.createCoupon); 
router.delete("/coupons/:id", adminAuth, couponController.deleteCoupon); 
router.patch('/coupons/:id', adminAuth, couponController.updateCoupon); 
router.get("/coupons/add", adminAuth, couponController.getAddCouponPage); 
router.get("/coupons/edit/:id", adminAuth, couponController.validateObjectId, couponController.getEditCouponPage); 

// Wallet Management Routes
// Routes for managing wallet transactions (admin side)
router.get('/wallet', adminAuth, walletController.getWalletTransactions); 
router.get('/wallet/:transactionId', adminAuth, walletController.getTransactionDetails); 

module.exports = router;