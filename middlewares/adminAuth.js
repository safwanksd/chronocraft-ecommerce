
// adminAuth.js
const adminAuth = (req, res, next) => {
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

module.exports = adminAuth;
