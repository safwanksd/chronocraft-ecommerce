// models/productSchema.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
    productName: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    brand: {
        type: Schema.Types.ObjectId,
        ref: "Brand",
        required: true
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        required: true
    },
    productOffer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Offer",
        default: null // Offer will be implemented in the future
    },
    variants: [{
        color: {
            type: String,
            required: true
        },
        colorName: {
            type: String,
            required: true
        },
        stock: {
            type: Number,
            required: true,
            default: 0
        },
        price: {
            type: Number,
            required: true 
        },
        salePrice: {
            type: Number,
            required: true,
        },
        productImages: {
            type: [String],
            required: true,
            validate: [
                array => array.length >= 1 && array.length <= 5,
                'Product must have between 1 and 5 images'
            ]
        },
        status: {
            type: String,
            enum: ["Available", "Out of Stock", "Discontinued"],
            required: true,
            default: "Available"
        }
    }],
    isBlocked: {
        type: Boolean,
        default: false
    },
    createdOn: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const Product = mongoose.model("Product", productSchema);

module.exports = Product;