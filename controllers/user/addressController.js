// controllers/user/addressController.js

const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const bcrypt = require("bcryptjs");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");

// Retrieves and displays all addresses for the logged-in user
const loadAddresses = async (req, res) => {
    try {
        const addresses = await Address.find({ user: req.session.user._id });
        res.render("user/addresses", {
            addresses,
            user: req.session.user,
            message: req.query.message,
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error("Error loading addresses:", error);
        res.status(500).send("Server Error");
    }
};

// Renders the page to add a new address
const loadAddAddress = async (req, res) => {
    try {
        res.render("user/add-address", { message: null });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error("Error loading add address:", error);
        res.status(500).send("Server Error");
    }
};

// Processes the addition of a new address for the user
const addAddress = async (req, res) => {
    try {
        const { street, city, state, pincode, isDefault } = req.body;
        if (isDefault) {
            await Address.updateMany(
                { user: req.session.user._id },
                { isDefault: false }
            );
        }
        const newAddress = new Address({
            user: req.session.user._id,
            street,
            city,
            state,
            pincode,
            isDefault: !!isDefault,
        });
        await newAddress.save();
        res.json({
            success: true,
            message: "Address added successfully",
            redirectUrl: "/user/profile/addresses",
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error("Error adding address:", error);
        res.json({ success: false, message: "Failed to add address" });
    }
};

// Renders the page to edit an existing address
const loadEditAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const address = await Address.findOne({
            _id: addressId,
            user: req.session.user._id,
        });
        if (!address)
            return res.redirect("/user/profile/addresses?message=Address not found");
        res.render("user/edit-address", { address, message: null });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error("Error loading edit address:", error);
        res.status(500).send("Server Error");
    }
};

// Updates an existing address with new details
const editAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const { street, city, state, pincode, isDefault } = req.body;
        const address = await Address.findOne({
            _id: addressId,
            user: req.session.user._id,
        });
        if (!address)
            return res.json({ success: false, message: "Address not found" });
        if (isDefault) {
            await Address.updateMany(
                { user: req.session.user._id },
                { isDefault: false }
            );
        }
        await Address.findByIdAndUpdate(addressId, {
            street,
            city,
            state,
            pincode,
            isDefault: !!isDefault,
        });
        res.json({
            success: true,
            message: "Address updated successfully",
            redirectUrl: "/user/profile/addresses",
        });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error("Error editing address:", error);
        res.json({ success: false, message: "Failed to update address" });
    }
};

// Deletes an existing address from the user's account
const deleteAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const address = await Address.findOne({
            _id: addressId,
            user: req.session.user._id,
        });
        if (!address)
            return res.json({ success: false, message: "Address not found" });
        await Address.findByIdAndDelete(addressId);
        res.json({ success: true, message: "Address deleted successfully" });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error("Error deleting address:", error);
        res.json({ success: false, message: "Failed to delete address" });
    }
};

module.exports = {
    loadAddresses,
    loadAddAddress,
    addAddress,
    loadEditAddress,
    editAddress,
    deleteAddress,
};