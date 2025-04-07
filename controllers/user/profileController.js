// controllers/user/profileController.js

const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const { sendVerificationEmail } = require('../../utils/email');
const bcrypt = require("bcryptjs");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Renders the user profile page with associated addresses
const loadProfile = async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user) {
            req.session.destroy(() => res.redirect("/user/login"));
            return;
        }
        const addresses = await Address.find({ user: user._id });
        res.render("user/profile", { user, addresses });
    } catch (error) {
        console.error("Error loading profile:", error);
        res.status(500).send("Server Error");
    }
};

// Renders the edit profile page
const loadEditProfile = async (req, res) => {
    try {
        res.render("user/edit-profile", { user: req.session.user, message: null });
    } catch (error) {
        console.error("Error loading edit profile:", error);
        res.status(500).send("Server Error");
    }
};

// Updates the user profile with new name, email, or profile image
const editProfile = async (req, res) => {
    try {
        const { name, email } = req.body;
        const user = await User.findById(req.session.user._id);
        const updates = { name };

        if (req.file) {
            updates.profileImage = `/uploads/profiles/${req.file.filename}`;
        }

        if (email && email !== user.email) {
            const existingEmail = await User.findOne({ email });
            if (existingEmail) {
                return res.render("user/edit-profile", {
                    user: req.session.user,
                    message: "Email already in use",
                });
            }
            const otp = generateOtp();
            req.session.userOtp = otp;
            req.session.pendingEmail = email;
            await sendVerificationEmail(email, otp);
            return res.redirect("/user/profile/verify-email");
        }

        await User.findByIdAndUpdate(req.session.user._id, updates);
        req.session.user.name = name; // Update session
        res.redirect("/user/profile");
    } catch (error) {
        console.error("Error editing profile:", error);
        res.render("user/edit-profile", {
            user: req.session.user,
            message: "Server error",
        });
    }
};

/* async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASS,
            },
        });

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account",
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP ${otp}</b>`,
        });

        return info.accepted.length > 0;
    } catch (error) {
        console.error("Error sending email", error);
        return false;
    }
} */

// Sends an OTP email for verification
const sendOtpEmail = async (userEmail, otp) => {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASS,
            },
        });

        const mailOptions = {
            from: process.env.NODEMAILER_EMAIL,
            to: userEmail,
            subject: "Your OTP Code",
            text: `Your OTP code is: ${otp}\n\nThis OTP is valid for 4 minutes.`,
        };

        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error("❌ Error sending OTP:", error);
        return false;
    }
};

// Renders the email verification page
const loadVerifyEmail = async (req, res) => {
    try {
        if (!req.session.pendingEmail) {
            return res.redirect("/user/profile");
        }
        res.render("user/verify-email", { message: null });
    } catch (error) {
        console.error("Error loading verify email:", error);
        res.status(500).send("Server Error");
    }
};

// Verifies the OTP and updates the user's email
const verifyEmail = async (req, res) => {
    try {
        const { otp } = req.body;
        if (otp !== req.session.userOtp) {
            return res.json({ success: false, message: "Invalid OTP" });
        }
        await User.findByIdAndUpdate(req.session.user._id, {
            email: req.session.pendingEmail,
        });
        req.session.user.email = req.session.pendingEmail;
        req.session.userOtp = null;
        req.session.pendingEmail = null;
        return res.json({ success: true, message: "Email updated successfully" });
    } catch (error) {
        console.error("Error verifying email:", error);
        return res.json({ success: false, message: "Server error" });
    }
};

// Renders the change password page
const loadChangePassword = async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (user.googleId && !user.password) {
            return res.redirect("/user/forgot-password"); // Or render a message
        }
        res.render("user/change-password", { message: null });
    } catch (error) {
        console.error("Error loading change password:", error);
        res.status(500).send("Server Error");
    }
};

// Updates the user's password
const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword, confirmPassword } = req.body;
        const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{6,}$/;

        if (!passwordPattern.test(newPassword)) {
            return res.render("user/change-password", {
                message:
                    "New password must be at least 6 characters and include a letter and a number",
            });
        }
        if (newPassword !== confirmPassword) {
            return res.render("user/change-password", {
                message: "Passwords do not match",
            });
        }
        const user = await User.findById(req.session.user._id);
        if (!user.password) {
            return res.render("user/change-password", {
                message: "Use forgot password for Google accounts",
            });
        }
        const isOldMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isOldMatch) {
            return res.render("user/change-password", {
                message: "Incorrect old password",
            });
        }
        const isSameAsOld = await bcrypt.compare(newPassword, user.password);
        if (isSameAsOld) {
            return res.render("user/change-password", {
                message: "New password cannot be the same as the old password",
            });
        }
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.redirect("/user/profile");
    } catch (error) {
        console.error("Error changing password:", error);
        res.render("user/change-password", { message: "Server error" });
    }
};

module.exports = {
    loadProfile,
    loadEditProfile,
    editProfile,
    loadVerifyEmail,
    verifyEmail,
    loadChangePassword,
    changePassword,
    sendVerificationEmail
};