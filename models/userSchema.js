
// models/userSchema.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: false, unique: true, sparse: true, default: null },
    phone: { type: String, required: false, unique: true, sparse: true, default: null },
    googleId: { type: String, default: null, unique: true, sparse: true },
    password: { type: String, required: false },
    isBlocked: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
    wishlist: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    referalCode: { type: String },
    redeemed: { type: Boolean },
    redeemedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    profileImage: { type: String, default: '/images/default-profile.jpg' }
}, { timestamps: true });


module.exports = mongoose.model('User', userSchema);