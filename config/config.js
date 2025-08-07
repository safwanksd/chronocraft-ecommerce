 // config/config.js

require('dotenv').config();

const config = {
    db: {
        uri: process.env.MONGO_URI || 'mongodb://localhost:27017/your_db_name',
    },
    razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID,
        keySecret: process.env.RAZORPAY_KEY_SECRET,
    },
    session: {
        secret: process.env.SESSION_SECRET || 'your_session_secret',
    },
};

module.exports = config;