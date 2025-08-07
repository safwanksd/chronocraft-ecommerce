
// middlewares/adminAuth.js
// Middleware to protect admin routes by checking if the user is an admin
/* const adminAuth = (req, res, next) => {
    if (req.session.admin) {
        // Prevent browser caching
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        next();
    } else {
        res.redirect("/admin/login");
    }
};

module.exports = adminAuth; */

const adminAuth = (req, res, next) => {
    console.log("Admin auth check - Session:", req.session);
    if (req.session.admin) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        next();
    } else {
        console.log("Admin auth failed - No admin session");
        res.redirect("/admin/login");
    }
};
module.exports = adminAuth;