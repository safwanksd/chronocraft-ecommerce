// app.js
const express = require('express');
const app = express();
const path = require('path');
const session = require('express-session');
const env = require('dotenv').config();
const db = require('./config/db');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const passport = require('./middlewares/passport');
const authMiddleware = require('./middlewares/authMiddleware');
const authController = require('./controllers/user/authController');

db();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'mySecretKey',
    resave: false,
    saveUninitialized: false, 
    rolling: true,   
    cookie: { secure: false, httpOnly: true, maxAge: 72 * 60 * 60 * 1000 },

}));

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

app.get('/', async (req, res) => {
    try {
        await authController.loadHomepage(req, res);
    } catch (error) {
        console.error('Error loading homepage:', error);
        res.status(500).render('error', { message: 'Server Error' });
    }
});

app.use('/user', userRouter);
app.use('/admin', adminRouter);

app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, 'views')]);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('public/uploads'));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    res.status(500).json({ success: false, message: 'Something went wrong on the server' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server Running on port ${PORT}`);
});

module.exports = app;