// controllers/user/authController.js

const User = require("../../models/userSchema");
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const { sendVerificationEmail } = require('../../utils/email');
const bcrypt = require("bcryptjs");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");

// Renders a 404 page for invalid routes
const pageNotFound = async (req, res) => {
    try {
        res.render("page-404");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

// Loads the homepage with featured products
const loadHomepage = async (req, res) => {
    try {
        const products = await Product.find({
            isBlocked: false,
            category: { $in: await Category.find({ isListed: true }).distinct('_id') },
            brand: { $in: await Brand.find({ isBlocked: false }).distinct('_id') }
        })
        .select('productName variants')
        .populate('category', 'name')
        .populate('brand', 'brandName')
        .sort({ createdAt: -1 })
        .limit(4);

        res.render('user/home', { 
            user: req.session.user || null, 
            products 
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error loading homepage:', error);
        res.status(500).send('Server Error');
    }
};

// Renders the signup page
const loadSignup = async (req, res) => {
    try {
        return res.render("user/signup", { user: req.session.user || null });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error(`Error loading signup page: ${error}`);
        res.status(500).send("Server Error");
    }
};

// Handles user signup with OTP generation and email verification
const signup = async (req, res) => {
    try {
        const { fullName, email, phone, password, confirmPassword } = req.body;

        // Check if passwords match
        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: "Passwords do not match" });
        }

        // Check if user already exists
        const findUser = await User.findOne({ email });
        if (findUser) {
            return res.status(400).json({ success: false, message: "User with this email already exists" });
        }

        // Generate OTP and expiration (10 minutes)
        const otp = generateOtp();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

        // Create a new user with unverified status
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            name: fullName,
            email,
            phone,
            password: hashedPassword,
            isVerified: false,
            otp,
            otpExpiresAt
        });

        await newUser.save();

        // Store user ID in session for verification
        req.session.userId = newUser._id.toString();

        // Send OTP email
        await sendVerificationEmail(email, otp);

        return res.status(200).json({ success: true, redirectUrl: "/user/verify-otp" });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error("Signup error:", error);
        return res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

// Renders the login page
const loadLogin = async (req, res) => {
    try {
        return res.render("user/login", { message: null, user: req.session.user || null });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error(`Error loading login page: ${error}`);
        return res.status(500).send("Server Error");
    }
};

// Handles user login with session management
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "All fields are required!" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: "User not found" });
        }

        if (user.isBlocked) {
            return res.status(403).json({ success: false, message: "Your account is blocked" });
        }

        if (!user.isVerified) {
            return res.status(403).json({ success: false, message: "Please verify your email to log in" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Incorrect password" });
        }

        req.session.user = {
            _id: user._id.toString(),
            email: user.email,
            name: user.name,
            isAdmin: user.isAdmin,
            isBlocked: user.isBlocked
        };

        return res.status(200).json({ success: true, redirectUrl: "/user/home" });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Error in login:', error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// Logs out the user and destroys the session
const logout = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                // Logs the error for debugging purposes
                console.error('Logout session destroy error:', err);
                return res.status(500).json({ success: false, message: "Logout failed" });
            }
            return res.status(200).json({ success: true, redirectUrl: "/user/login" });
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error('Logout error:', error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Generates a 6-digit OTP for verification
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Verifies the OTP for signup or password reset
const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        // Check for signup OTP verification
        if (req.session.userId) {
            const user = await User.findById(req.session.userId);
            if (!user) {
                return res.status(404).json({ success: false, message: "User not found" });
            }

            // Check if OTP is expired
            if (user.otpExpiresAt < new Date()) {
                return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
            }

            // Verify OTP
            if (otp !== user.otp) {
                return res.status(400).json({ success: false, message: "Invalid OTP" });
            }

            // Mark user as verified and clear OTP fields
            user.isVerified = true;
            user.otp = null;
            user.otpExpiresAt = null;
            await user.save();

            // Set user session
            req.session.user = {
                _id: user._id.toString(),
                email: user.email,
                name: user.name,
                phone: user.phone,
                isAdmin: user.isAdmin,
                isBlocked: user.isBlocked
            };
            req.session.userId = null;

            return res.status(200).json({ success: true, redirectUrl: '/user/home' });
        }

        // Check for password reset OTP verification
        if (req.session.resetEmail) {
            const user = await User.findOne({ email: req.session.resetEmail });
            if (!user) {
                return res.status(404).json({ success: false, message: "User not found" });
            }

            if (user.otpExpiresAt < new Date()) {
                return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
            }

            if (otp !== user.otp) {
                return res.status(400).json({ success: false, message: "Invalid OTP" });
            }

            // Clear OTP fields and mark as verified for reset
            user.otp = null;
            user.otpExpiresAt = null;
            await user.save();

            req.session.otpVerified = true;
            return res.status(200).json({ success: true, redirectUrl: "/user/reset-password" });
        }

        return res.status(400).json({ success: false, message: "Session expired! Try again." });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error("Error in OTP verification:", error);
        return res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

// Resends a new OTP for verification
const resendOtp = async (req, res) => {
    try {
        // Determine the target email: pendingEmail (email change) or userId (signup) or resetEmail (password reset)
        let targetEmail = req.session.pendingEmail || req.session.resetEmail;
        let user;

        if (req.session.userId) {
            user = await User.findById(req.session.userId);
            if (!user) {
                return res.json({ success: false, message: "User not found" });
            }
            targetEmail = user.email;
        } else if (req.session.resetEmail) {
            user = await User.findOne({ email: req.session.resetEmail });
            if (!user) {
                return res.json({ success: false, message: "User not found" });
            }
            targetEmail = user.email;
        }

        if (!targetEmail) {
            return res.json({ success: false, message: "Session expired. Please try again." });
        }

        const newOtp = generateOtp();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

        // Update OTP in the database
        user.otp = newOtp;
        user.otpExpiresAt = otpExpiresAt;
        await user.save();

        // Send new OTP email
        await sendVerificationEmail(targetEmail, newOtp);

        return res.json({ success: true, message: "OTP resent successfully!" });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error("Error in resending OTP:", error);
        return res.json({ success: false, message: "Something went wrong. Try again later." });
    }
};

// Handles Google authentication callback and sets user session
const googleAuthCallback = async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect("/user/login");
        }

        const user = await User.findById(req.user._id);
        if (user.isBlocked) {
            req.session.destroy((err) => {
                if (err) {
                    // Logs the error for debugging purposes
                    console.error('Error destroying session:', err);
                    return res.redirect("/user/login");
                }
                res.setHeader('X-Blocked-Message', 'Your account has been blocked by the admin.');
                return res.redirect("/user/login");
            });
            return;
        }

        req.session.user = {
            _id: req.user._id.toString(),
            email: req.user.email,
            name: req.user.name,
            isAdmin: user.isAdmin,
            isBlocked: user.isBlocked
        };
        return res.redirect("/user/home");
    } catch (error) {
        // Logs the error for debugging purposes
        console.error("Google Auth Callback Error:", error);
        res.redirect("/user/login");
    }
};

// Initiates the forgot password process with OTP generation
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ success: false, message: "Email not found" });
        }

        const otp = generateOtp();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

        // Store OTP in the database
        user.otp = otp;
        user.otpExpiresAt = otpExpiresAt;
        await user.save();

        req.session.resetEmail = email;
        await sendVerificationEmail(email, otp);

        return res.status(200).json({ 
            success: true, 
            message: "OTP sent successfully", 
            redirectUrl: "/user/verify-otp" 
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error("Forgot Password Error:", error);
        return res.status(500).json({ success: false, message: "Something went wrong" });
    }
};

// Verifies the OTP for forgot password process (note: logic seems incomplete, assuming placeholder)
const verifyForgotOtp = (req, res) => {
    if (req.body.otp !== req.session.resetOtp) {
        return res.render("user/verify-forgot-otp", { message: "Invalid OTP" });
    }

    req.session.resetOtp = null;
    res.redirect("/user/reset-password");
};

// Updates the user's password after OTP verification
const resetPassword = async (req, res) => {
    const { password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        return res.render("user/reset-password", { message: "Passwords do not match" });
    }

    const user = await User.findOne({ email: req.session.resetEmail });
    if (!user) {
        return res.render("user/reset-password", { message: "User not found" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    await user.save();

    req.session.resetEmail = null;
    res.redirect("/user/login");
};

// Renders the forgot password page
const loadForgotPassword = (req, res) => {
    res.render("user/forgot-password", { message: "" });
};

// Renders the OTP verification page
const loadVerifyOtp = (req, res) => {
    if (req.session.user) {
        return res.redirect("/user/home");
    }
    res.render("user/verify-otp", { message: null });
};

// Renders the reset password page
const loadResetPassword = (req, res) => {
    res.render("user/reset-password", { message: "" });
};

module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    signup,
    loadLogin,
    login,
    logout,
    verifyOtp,
    resendOtp,
    googleAuthCallback,
    forgotPassword,
    verifyForgotOtp,
    resetPassword,
    loadForgotPassword,
    loadVerifyOtp,
    loadResetPassword
};