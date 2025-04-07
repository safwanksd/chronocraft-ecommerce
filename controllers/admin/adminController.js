// adminController.js
// Controller for admin authentication and dashboard management

const Admin = require("../../models/adminSchema");
const bcrypt = require("bcrypt");

// Render the admin login page
const getLoginPage = (req, res) => {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }
  res.render("admin/login", { error: null });
};

// Handle admin login form submission
const postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(401).render("admin/login", { error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).render("admin/login", { error: "Invalid credentials" });
    }

    req.session.admin = { id: admin._id, email: admin.email };
    res.redirect("/admin/dashboard");
  } catch (error) {
    console.error("Login Error:", error); 
    res.status(500).render("admin/login", { error: "Server error" });
  }
};

// Render the admin dashboard page
const getDashboard = (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }

  try {
    res.render("admin/dashboard");
  } catch (error) {
    console.error("Dashboard rendering error:", error); // Essential log
    res.status(500).render("admin/error", { message: "Server error" });
  }
};

// Log out the admin and redirect to login page
const logout = (req, res) => {
  req.session.admin = null;
  res.redirect("/admin/login");
};

module.exports = { 
  getLoginPage, 
  postLogin, 
  logout, 
  getDashboard 
};