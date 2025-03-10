// adminController.js

const Admin = require("../../models/adminSchema");
const bcrypt = require("bcrypt");

// GET Admin Login Page
const getLoginPage = (req, res) => {
    if (req.session.admin) {
        return res.redirect("/admin/dashboard"); // Redirect if already logged in
    }
    res.render("admin/login", { error: null });
};



// POST Admin Login
const postLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await Admin.findOne({ email });

        if (!admin) {
            return res.render("admin/login", { error: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.render("admin/login", { error: "Invalid credentials" });
        }

        req.session.admin = { id: admin._id, email: admin.email }; // Store only necessary details

        res.redirect("/admin/dashboard"); // Redirect to dashboard

    } catch (error) {
        console.error("Login Error:", error);
        res.render("admin/login", { error: "Server error" });
    }
};

const getDashboard = (req, res) => {
    if (!req.session.admin) {
        return res.redirect("/admin/login");
    }

    res.render("admin/dashboard");

};




// Logout Admin
const logout = (req, res) => {
    req.session.admin = null;
    res.redirect("/admin/login");
};

module.exports = { getLoginPage, postLogin, logout, getDashboard, };
