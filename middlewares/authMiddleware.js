// middlewares/authMiddleware.js
const User = require('../models/userSchema');

const isLoggedIn = (req, res, next) => {
    if (req.session.user) {
        return res.redirect("/user/home");
    }
    next();
};

const checkAuth = (req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
};

const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        if (req.xhr || (req.headers['x-requested-with'] && req.headers['x-requested-with'].toLowerCase() === 'xmlhttprequest')) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please log in.", redirect: "/user/login" });
        }
        return res.redirect("/user/login");
    }
    next();
};

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