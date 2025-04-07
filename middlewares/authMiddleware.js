// middlewares/authMiddleware.js
// Middleware functions for user authentication and authorization

const User = require('../models/userSchema');

// Redirects logged-in users to the homepage, allows unauthenticated users to proceed
const isLoggedIn = (req, res, next) => {
    if (req.session.user) {
        return res.redirect("/user/home");
    }
    next();
};

// Sets the user in res.locals for use in views
const checkAuth = (req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
};

// Ensures the user is authenticated; otherwise, redirects to login
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in.", redirect: "/user/login" });
        }
        return res.redirect("/user/login");
    }
    next();
};

// Checks if the user is blocked; logs out and redirects if blocked
const checkBlockedStatus = async (req, res, next) => {
    if (!req.session.user) {
        if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in.", redirect: "/user/login" });
        }
        return res.redirect("/user/login");
    }

    try {
        const user = await User.findById(req.session.user._id || req.session.user.id);
        if (!user) {
            // User not found in DB, log out
            req.session.destroy(() => {
                if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
                    return res.status(401).json({ success: false, message: "User not found. Please log in again.", redirect: "/user/login" });
                }
                return res.redirect("/user/login");
            });
        } else if (user.isBlocked) {
            // User is blocked, log out and redirect with message
            req.session.destroy(() => {
                if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
                    return res.status(403).json({ success: false, message: "Your account has been blocked by the admin.", redirect: "/user/login" });
                }
                res.setHeader('X-Blocked-Message', 'Your account has been blocked by the admin.');
                return res.redirect("/user/login");
            });
        } else {
            // User is not blocked, update session with plain object and proceed
            req.session.user = {
                _id: user._id.toString(),
                email: user.email,
                name: user.name,
                isAdmin: user.isAdmin,
                isBlocked: user.isBlocked
            };
            next();
        }
    } catch (error) {
        console.error('Error checking blocked status:', error);
        if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
            return res.status(500).json({ success: false, message: 'Server error' });
        }
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    isLoggedIn,
    checkAuth,
    requireAuth,
    checkBlockedStatus
};