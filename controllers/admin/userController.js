// controllers/admin/userController.js

const User = require("../../models/userSchema");

// Retrieves a paginated list of users with search and sort options
const getUsers = async (req, res) => {
    try {
        let { search, page, sort } = req.query;
        const limit = 10;
        const currentPage = parseInt(page) || 1;
        const skip = (currentPage - 1) * limit;

        let query = {};
        if (search) {
            query = {
                $or: [
                    { name: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } }
                ]
            };
        }

        let sortQuery = { createdAt: -1 };
        if (sort === "oldest") sortQuery = { createdAt: 1 };
        if (sort === "name") sortQuery = { name: 1 };

        const users = await User.find(query).sort(sortQuery).skip(skip).limit(limit);
        const totalUsers = await User.countDocuments(query);
        const totalPages = Math.ceil(totalUsers / limit);

        res.render("admin/users", { users, search, currentPage, totalPages, sort });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error("Error fetching users:", error);
        res.redirect("/admin/dashboard");
    }
};

// Blocks a user by setting their isBlocked status to true
const blockUser = async (req, res) => {
    try {
        const userId = req.params.id;
        console.log("Attempting to block user with ID:", userId);

        const user = await User.findById(userId);
        if (!user) {
            console.log("User not found with ID:", userId);
            return res.status(404).json({ success: false, message: "User not found" });
        }

        console.log("User found, isBlocked before:", user.isBlocked);
        user.isBlocked = true;
        await user.save();
        console.log("User blocked, isBlocked after:", user.isBlocked);

        return res.json({ success: true, message: "User blocked successfully" });
    } catch (error) {
        console.error("Error blocking user:", error.message, error.stack);
        return res.status(500).json({ success: false, message: "Failed to update user status: " + error.message });
    }
};

const unblockUser = async (req, res) => {
    try {
        const userId = req.params.id;
        console.log("Attempting to unblock user with ID:", userId);

        const user = await User.findById(userId);
        if (!user) {
            console.log("User not found with ID:", userId);
            return res.status(404).json({ success: false, message: "User not found" });
        }

        console.log("User found, isBlocked before:", user.isBlocked);
        user.isBlocked = false;
        await user.save();
        console.log("User unblocked, isBlocked after:", user.isBlocked);

        return res.json({ success: true, message: "User unblocked successfully" });
    } catch (error) {
        console.error("Error unblocking user:", error.message, error.stack);
        return res.status(500).json({ success: false, message: "Failed to update user status: " + error.message });
    }
};

// Renders the page to add a new product (note: this seems misplaced, likely intended for productController)
const getAddProductPage = async (req, res) => {
    try {
        // Fetch categories and brands from the database
        const categories = await Category.find({});
        const brands = await Brand.find({});

        res.render("admin/add-product", { categories, brands });
    } catch (error) {
        // Logs the error for debugging purposes
        console.error("Error loading add product page:", error);
        res.status(500).send("Server Error");
    }
};

module.exports = {
    getUsers,
    blockUser,
    unblockUser,
    getAddProductPage
};