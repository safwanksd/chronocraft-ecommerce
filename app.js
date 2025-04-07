// app.js - Main application file for ChronoCraft e-commerce platform
require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const session = require('express-session');
const db = require('./config/db');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const passport = require('./middlewares/passport');
const authMiddleware = require('./middlewares/authMiddleware');
const authController = require('./controllers/user/authController');

// Connect to MongoDB
db();

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware for user authentication
app.use(session({
    secret: process.env.SESSION_SECRET || 'mySecretKey', // Fallback for development
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { secure: false, httpOnly: true, maxAge: 72 * 60 * 60 * 1000 }, // 72 hours
}));

// Middleware to prevent caching
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Initialize Passport for authentication
app.use(passport.initialize());
app.use(passport.session());

// Middleware to set user in res.locals for views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Route to load the homepage
app.get('/', async (req, res) => {
    try {
        await authController.loadHomepage(req, res);
    } catch (error) {
        console.error('Error loading homepage:', error);
        res.status(500).render('error', { message: 'Server Error' });
    }
});

// Mount user and admin routers
app.use('/user', userRouter);
app.use('/admin', adminRouter);

// Set EJS as the view engine and configure views directory
app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, 'views')]);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('public/uploads'));

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    if (req.xhr) {
        return res.status(500).json({ success: false, message: 'Something went wrong on the server' });
    }
    res.status(500).render('error', { message: 'Something went wrong on the server' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server Running on port ${PORT}`);
});

module.exports = app;