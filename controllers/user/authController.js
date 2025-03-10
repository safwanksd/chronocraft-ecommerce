// controllers/user/authController.js
const User = require("../../models/userSchema");
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const { sendVerificationEmail } = require('../../utils/email');
const bcrypt = require("bcryptjs");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");

const pageNotFound = async (req, res) => {
    try {
        res.render("page-404");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

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
        console.error('Error loading homepage:', error);
        res.status(500).send('Server Error');
    }
};

const loadSignup = async (req, res) => {
    try {
        return res.render("user/signup", { user: req.session.user || null });
    } catch (error) {
        console.log(`Home page not loading: ${error}`);
        res.status(500).send("Server Error");
    }
};

const signup = async (req, res) => {
    try {
        console.log("Signup request received:", req.body);

        const { fullName, email, phone, password, confirmPassword } = req.body;

        // Check if passwords match
        if (password !== confirmPassword) {
            console.log("❌ Passwords do not match");
            return res.status(400).json({ success: false, message: "Passwords do not match" });
        }

        // Check if user already exists
        const findUser = await User.findOne({ email });
        if (findUser) {
            console.log("❌ User with this email already exists");
            return res.status(400).json({ success: false, message: "User with this email already exists" });
        }

        // Generate OTP and expiration (10 minutes)
        const otp = generateOtp();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

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
        console.log("User created with OTP:", { id: newUser._id, email, otp });

        // Send OTP email
        sendVerificationEmail(email, otp)
            .then(() => console.log("OTP email sent successfully!"))
            .catch((err) => console.error("❌ Error sending OTP email:", err));

        return res.status(200).json({ success: true, redirectUrl: "/user/verify-otp" });
    } catch (error) {
        console.error("Signup error:", error);
        return res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

const loadLogin = async (req, res) => {
    try {
        return res.render("user/login", { message: null, user: req.session.user || null });
    } catch (error) {
        console.log(`Error loading login page: ${error}`);
        return res.status(500).send("Server Error");
    }
};

const login = async (req, res) => {
    try {
        console.log("Login Attempt:", req.body);

        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "All fields are required!" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            console.log('User not found for:', email);
            return res.status(400).json({ success: false, message: "User not found" });
        }

        if (user.isBlocked) {
            console.log('Blocked user attempted login:', email);
            return res.status(403).json({ success: false, message: "Your account is blocked" });
        }

        if (!user.isVerified) {
            console.log('Unverified user attempted login:', email);
            return res.status(403).json({ success: false, message: "Please verify your email to log in" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('Incorrect password for:', email);
            return res.status(400).json({ success: false, message: "Incorrect password" });
        }

        req.session.user = {
            _id: user._id.toString(),
            email: user.email,
            name: user.name,
            isAdmin: user.isAdmin,
            isBlocked: user.isBlocked
        };

        console.log("Login Successful:", req.session.user);
        return res.status(200).json({ success: true, redirectUrl: "/user/home" });
    } catch (error) {
        console.error('Error in login:', error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

const logout = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.error('Logout session destroy error:', err);
                return res.status(500).json({ success: false, message: "Logout failed" });
            }
            console.log("Logout successful");
            return res.status(200).json({ success: true, redirectUrl: "/user/login" });
        });
    } catch (error) {
        console.error('Logout error:', error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        console.log("OTP received:", otp);

        // Check for signup OTP verification
        if (req.session.userId) {
            const user = await User.findById(req.session.userId);
            if (!user) {
                console.log("❌ User not found for OTP verification");
                return res.status(404).json({ success: false, message: "User not found" });
            }

            // Check if OTP is expired
            if (user.otpExpiresAt < new Date()) {
                console.log("❌ OTP expired for user:", user.email);
                return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
            }

            // Verify OTP
            if (otp !== user.otp) {
                console.log(`❌ Invalid OTP for signup: ${otp}, Expected: ${user.otp}`);
                return res.status(404).json({ success: false, message: "Invalid OTP" });
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
            req.session.userId = null; // Clear temporary userId

            console.log("✅ User verified:", user.email);
            return res.status(200).json({ success: true, redirectUrl: '/user/home' });
        }

        // Check for password reset OTP verification
        if (req.session.resetEmail) {
            const user = await User.findOne({ email: req.session.resetEmail });
            if (!user) {
                console.log("❌ User not found for password reset OTP");
                return res.render("user/verify-otp", { message: "User not found" });
            }

            if (user.otpExpiresAt < new Date()) {
                console.log("❌ OTP expired for password reset:", user.email);
                return res.render("user/verify-otp", { message: "OTP expired. Please request a new one." });
            }

            if (otp !== user.otp) {
                console.log(`❌ Invalid OTP for password reset: ${otp}, Expected: ${user.otp}`);
                return res.render("user/verify-otp", { message: "Invalid OTP" });
            }

            // Clear OTP fields and mark as verified for reset
            user.otp = null;
            user.otpExpiresAt = null;
            await user.save();

            req.session.otpVerified = true;
            console.log("✅ OTP verified for password reset:", user.email);
            return res.redirect("/user/reset-password");
        }

        console.log("❌ OTP verification failed: No valid session found.");
        return res.render("user/verify-otp", { message: "Session expired! Try again." });
    } catch (error) {
        console.error("❌ Error in OTP verification:", error);
        res.render("user/verify-otp", { message: "Server error. Please try again." });
    }
};

const resendOtp = async (req, res) => {
    try {
        // Determine the target email: pendingEmail (email change) or userId (signup) or resetEmail (password reset)
        let targetEmail = req.session.pendingEmail || req.session.resetEmail;
        let user;

        if (req.session.userId) {
            user = await User.findById(req.session.userId);
            if (!user) {
                console.log("❌ Resend OTP Failed: User not found");
                return res.json({ success: false, message: "User not found" });
            }
            targetEmail = user.email;
        } else if (req.session.resetEmail) {
            user = await User.findOne({ email: req.session.resetEmail });
            if (!user) {
                console.log("❌ Resend OTP Failed: User not found for reset");
                return res.json({ success: false, message: "User not found" });
            }
            targetEmail = user.email;
        }

        if (!targetEmail) {
            console.log("❌ Resend OTP Failed: No email found in session.");
            return res.json({ success: false, message: "Session expired. Please try again." });
        }

        const newOtp = generateOtp();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        // Update OTP in the database
        user.otp = newOtp;
        user.otpExpiresAt = otpExpiresAt;
        await user.save();

        console.log("🔄 New OTP Generated:", newOtp, "for", targetEmail);

        const emailSent = await sendVerificationEmail(targetEmail, newOtp);
        if (!emailSent) {
            console.log("❌ Failed to send OTP email to:", targetEmail);
            return res.json({ success: false, message: "Failed to resend OTP." });
        }

        console.log("✅ OTP Resent Successfully to:", targetEmail);
        return res.json({ success: true, message: "OTP resent successfully!" });
    } catch (error) {
        console.error("❌ Error in resending OTP:", error);
        return res.json({ success: false, message: "Something went wrong. Try again later." });
    }
};

const googleAuthCallback = async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect("/user/login");
        }

        const user = await User.findById(req.user._id);
        if (user.isBlocked) {
            req.session.destroy((err) => {
                if (err) {
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
        console.error("Google Auth Callback Error:", error);
        res.redirect("/user/login");
    }
};

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.render("user/forgot-password", { message: "Email not found!" });
        }

        const otp = generateOtp();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        // Store OTP in the database
        user.otp = otp;
        user.otpExpiresAt = otpExpiresAt;
        await user.save();

        req.session.resetEmail = email; // Still needed to track which user is resetting
        console.log("📢 Forgot Password OTP Sent:", otp);

        sendVerificationEmail(email, otp).catch((err) => {
            console.error("❌ Email sending failed:", err);
        });

        return res.redirect("/user/verify-otp");
    } catch (error) {
        console.error("Forgot Password Error:", error);
        return res.render("user/forgot-password", { message: "Something went wrong!" });
    }
};

const verifyForgotOtp = (req, res) => {
    if (req.body.otp !== req.session.resetOtp) {
        return res.render("user/verify-forgot-otp", { message: "Invalid OTP" });
    }

    req.session.resetOtp = null;
    res.redirect("/user/reset-password");
};

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
    resetPassword
};