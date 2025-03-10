// controllers/user/authController.js
const User = require("../../models/userSchema");
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const {sendVerificationEmail} = require('../../utils/email');
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
        // Fetch 4 latest products, showing only essential fields for guests
        const products = await Product.find({
            isBlocked: false,
            category: { $in: await Category.find({ isListed: true }).distinct('_id') },
            brand: { $in: await Brand.find({ isBlocked: false }).distinct('_id') }
        })
        .select('productName variants') // Select only name and variants (for price/image)
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

      // Generate and store OTP
      const otp = generateOtp();
      console.log("Generated OTP:", otp);

      req.session.userOtp = otp;
      req.session.userData = { name: fullName, email, phone, password };
      console.log("User data stored in session:", req.session.userData);

      // Send OTP email asynchronously
      sendVerificationEmail(email, otp)
          .then(() => console.log("OTP email sent successfully!"))
          .catch((err) => console.error("❌ Error sending OTP email:", err));

      // Return success response
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
          console.log("otp reeived",otp)
          console.log("📢 OTP Verification Session Data:", req.session);
  
          if (req.session.userOtp && req.session.userData) {
              if (otp !== req.session.userOtp.toString()) {
                  console.log(`❌ Invalid OTP for signup: ${otp}, Expected: ${req.session.userOtp}`);


                  return res.status(404).json({success:false,message:"invalid otp"})
              }
  
              const hashedPassword = await bcrypt.hash(req.session.userData.password, 10);
              const newUser = new User({
                  name: req.session.userData.name || "Unknown",
                  email: req.session.userData.email,
                  phone: req.session.userData.phone,
                  password: hashedPassword,
              });
  
              await newUser.save();
  
              req.session.userOtp = null;
              req.session.userData = null;
              req.session.user = {
                  _id: newUser._id.toString(),
                  email: newUser.email,
                  name: newUser.name,
                  phone: newUser.phone,
                  isAdmin: newUser.isAdmin,
                  isBlocked: newUser.isBlocked
              };
  
              
              return res.status(200).json({success:true,redirectUrl:'/user/home'})
          }
  
          if (req.session.resetOtp && req.session.resetEmail) {
              if (otp !== req.session.resetOtp.toString()) {
                  console.log(`❌ Invalid OTP for password reset: ${otp}, Expected: ${req.session.resetOtp}`);
                  return res.render("user/verify-otp", { message: "Invalid OTP" });
              }
  
              req.session.otpVerified = true;
              console.log(" OTP verified for password reset.");
  
              return res.redirect("/user/reset-password");
          }
  
          console.log("❌ OTP verification failed: No valid OTP session found.");
          return res.render("user/verify-otp", { message: "Session expired! Try again." });
      } catch (error) {
          console.error("❌ Error in OTP verification:", error);
          res.render("user/verify-otp", { message: "Server error. Please try again." });
      }
  };
const resendOtp = async (req, res) => {
  try {
      // Determine the target email: pendingEmail (email change) or userData.email (signup)
      const targetEmail = req.session.pendingEmail || (req.session.userData && req.session.userData.email);
      if (!targetEmail) {
          console.log("❌ Resend OTP Failed: No email found in session.");
          return res.json({
              success: false,
              message: "Session expired. Please try again.",
          });
      }

      const newOtp = generateOtp(); // Use your existing function
      req.session.userOtp = newOtp;

      console.log("🔄 New OTP Generated:", newOtp, "for", targetEmail);

      const emailSent = await sendVerificationEmail(targetEmail, newOtp); // Use sendVerificationEmail for consistency

      if (!emailSent) {
          console.log("❌ Failed to send OTP email to:", targetEmail);
          return res.json({ success: false, message: "Failed to resend OTP." });
      }

      console.log("✅ OTP Resent Successfully to:", targetEmail);
      return res.json({ success: true, message: "OTP resent successfully!" });
  } catch (error) {
      console.error("❌ Error in resending OTP:", error);
      return res.json({
          success: false,
          message: "Something went wrong. Try again later.",
      });
  }
};

const googleAuthCallback = async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect("/user/login");
        }

        // Check if the user is blocked
        const user = await User.findById(req.user._id);
        if (user.isBlocked) {
            req.session.destroy((err) => {
                if (err) {
                    console.error('Error destroying session:', err);
                    return res.redirect("/user/login");
                }
                // Set a header or query param to pass the blocked message
                res.setHeader('X-Blocked-Message', 'Your account has been blocked by the admin.');
                return res.redirect("/user/login");
            });
            return;
        }

        // If not blocked, set the session and proceed
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
        req.session.resetOtp = otp;
        req.session.resetEmail = email;

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

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.updateOne({ email: req.session.resetEmail }, { password: hashedPassword });

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