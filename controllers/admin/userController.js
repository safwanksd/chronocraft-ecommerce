// admin/userController.js

const User = require("../../models/userSchema");

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
        console.error("Error fetching users:", error);
        res.redirect("/admin/dashboard");
    }
};

const blockUser = async (req, res) => {
    try {
        const userId = req.params.id;
        console.log(`Blocking user: ${userId}`);

        const user = await User.findById(userId);
        if (!user) {
            console.error("User not found!");
            return res.status(404).json({ success: false, message: "User not found" });
        }

        user.isBlocked = true;
        await user.save();

        console.log(`User ${userId} blocked successfully!`);
        return res.json({ success: true, message: "User blocked successfully" });
    } catch (error) {
        console.error("Error blocking user:", error);
        return res.status(500).json({ success: false, message: "Failed to update user status" });
    }
};

const unblockUser = async (req, res) => {
    try {
        const userId = req.params.id;
        console.log(`Unblocking user: ${userId}`);

        const user = await User.findById(userId);
        if (!user) {
            console.error("User not found!");
            return res.status(404).json({ success: false, message: "User not found" });
        }

        user.isBlocked = false;
        await user.save();

        console.log(`User ${userId} unblocked successfully!`);
        return res.json({ success: true, message: "User unblocked successfully" });
    } catch (error) {
        console.error("Error unblocking user:", error);
        return res.status(500).json({ success: false, message: "Failed to update user status" });
    }
};

const getAddProductPage = async (req, res) => {
    try {
        // Fetch categories & brands from DB
        const categories = await Category.find({});
        const brands = await Brand.find({});

        res.render("admin/add-product", { categories, brands });
    } catch (error) {
        console.log("Error loading add product page:", error);
        res.status(500).send("Server Error");
    }
};


module.exports = { getUsers, blockUser, unblockUser, getAddProductPage };
