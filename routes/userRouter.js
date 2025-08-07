// routes/userRouter.js - Defines routes for user-related functionality
const express = require("express");
const router = express.Router();
const authController = require("../controllers/user/authController");
const profileController = require("../controllers/user/profileController");
const addressController = require("../controllers/user/addressController");
const cartController = require("../controllers/user/cartController");
const productController = require('../controllers/user/productController');
const checkoutController = require('../controllers/user/checkoutController');
const orderController = require('../controllers/user/orderController');
const walletController = require('../controllers/user/walletController');
const wishlistController = require('../controllers/user/wishlistController');
const couponController = require("../controllers/user/couponController");
const countController = require('../controllers/user/countController');
const authMiddleware = require("../middlewares/authMiddleware");
const passport = require("../middlewares/passport");
const { uploadProfile } = require("../middlewares/multer");
const setHeaderCounts = require('../middlewares/countMiddleware');

// Auth Routes (no auth required)
router.get("/login", authMiddleware.isLoggedIn, authController.loadLogin);
router.post("/login", authController.login);
router.get("/logout", authController.logout);

router.get("/signup", authMiddleware.isLoggedIn, authController.loadSignup);
router.post("/signup", authController.signup);

router.use(setHeaderCounts);

// Protected Routes (require auth and block check)
router.get("/home", authController.loadHomepage); 
router.get("/shop", authMiddleware.checkBlockedStatus, productController.getShopPage); 
router.get("/men", authMiddleware.checkBlockedStatus, productController.getMenPage); 
router.get("/women", authMiddleware.checkBlockedStatus, productController.getWomenPage);
router.get("/product-detail/:id", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, productController.getProductDetails);

// Profile Routes 
router.get("/profile", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, profileController.loadProfile);
router.get("/profile/edit", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, profileController.loadEditProfile);
router.post("/profile/edit", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, uploadProfile, profileController.editProfile);
router.get("/profile/verify-email", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, profileController.loadVerifyEmail);
router.post("/profile/verify-email", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, profileController.verifyEmail);
router.post("/profile/resend-otp", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, authController.resendOtp);
router.get("/profile/change-password", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, profileController.loadChangePassword);
router.post("/profile/change-password", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, profileController.changePassword);

// Address Management Routes
router.get("/profile/addresses", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, addressController.loadAddresses);
router.get("/profile/addresses/add", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, addressController.loadAddAddress);
router.post("/profile/addresses/add", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, addressController.addAddress);
router.get("/profile/addresses/edit/:addressId", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, addressController.loadEditAddress);
router.post("/profile/addresses/edit/:addressId", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, addressController.editAddress);
router.delete("/profile/addresses/delete/:addressId", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, addressController.deleteAddress);

// Cart Management Routes
router.get("/cart", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, cartController.getCart);
router.post("/cart/add", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, cartController.addToCart);
router.patch("/cart/update/:itemId", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, cartController.updateQuantity);
router.delete("/cart/remove/:itemId", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, cartController.removeFromCart);
router.get("/cart/check", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, cartController.checkCartStatus);

router.get("/counts", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, countController.getCounts);

// Wishlist Routes
router.get("/wishlist", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, wishlistController.getWishlist);
router.post("/wishlist/add", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, wishlistController.addToWishlist);
router.delete("/wishlist/remove/:wishlistId", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, wishlistController.removeFromWishlist);
router.patch("/wishlist/update/:wishlistId", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, wishlistController.updateWishlistVariant);

// Checkout Route
router.get("/checkout", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, checkoutController.getCheckout);
router.post('/checkout/place-order', authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, checkoutController.placeOrder);
router.post('/checkout/initiate-payment', authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, checkoutController.initiatePayment);
router.post('/checkout/verify-payment', authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, checkoutController.verifyPayment);
router.get('/order-success/:orderId', authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, checkoutController.getOrderSuccess);
router.get('/order-failure/:orderId', authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, checkoutController.getOrderFailure);

// Order Management Routes (User Side)
router.get("/orders", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, orderController.getOrders);
router.get("/order/:orderId", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, orderController.getOrderDetail);
router.post("/order/:orderId/cancel", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, orderController.cancelOrder);
router.post("/order/:orderId/cancel-item/:itemId", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, orderController.cancelItem);
router.post("/order/:orderId/return", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, orderController.returnOrder);
router.get("/order/:orderId/download-invoice", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, orderController.downloadInvoice);

// wallet
router.get("/wallet", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, walletController.loadWallet);
router.post("/wallet/add-money", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, walletController.addMoney);
router.get("/wallet/transactions", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, walletController.loadTransactionHistory);

// Coupon Management Routes
router.get("/coupon/available", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, couponController.getAvailableCoupons);
router.post("/coupon/apply", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, couponController.applyCoupon);
router.post("/coupon/remove", authMiddleware.requireAuth, authMiddleware.checkBlockedStatus, couponController.removeCoupon);

// Google OAuth Routes (no block check needed during auth)
router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get(
    "/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/user/login" }),
    authController.googleAuthCallback
);

// Forgot Password Routes (no auth required)
router.get("/forgot-password", authController.loadForgotPassword);
router.post("/forgot-password", authController.forgotPassword);

// OTP Verification Routes (no auth required)
router.get("/verify-otp", authController.loadVerifyOtp);
router.post("/verify-otp", authController.verifyOtp);
router.post("/resend-otp", authController.resendOtp);
router.post("/verify-forgot-otp", authController.verifyForgotOtp);

// Reset Password Routes (no auth required)
router.get("/reset-password", authController.loadResetPassword);
router.post("/reset-password", authController.resetPassword);

// Miscellaneous Routes (no auth required)
router.get("/pageNotFound", authController.pageNotFound);

module.exports = router;