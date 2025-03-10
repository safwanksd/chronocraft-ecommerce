// controllers/admin/categoryController.js

const Category = require("../../models/categorySchema");

const getCategories = async (req, res) => {
    try {
        let { search = "", page = 1, limit = 5 } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);

        const filter = {
            name: { $regex: search, $options: "i" } // Search filter (case insensitive)
        };

        const categories = await Category.find(filter)
            .sort({ createdAt: -1 }) // Ensures latest categories show first
            .skip((page - 1) * limit)
            .limit(limit);

        const totalCategories = await Category.countDocuments(filter);

        res.render("admin/category", {
            categories,
            currentPage: page,
            totalPages: Math.ceil(totalCategories / limit),
            search
        });

    } catch (error) {
        console.log("Error fetching categories:", error);
        res.status(500).send("Server Error");
    }
};


const addCategory = async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name.trim()) {
            return res.status(400).json({ error: "Category name is required" });
        }

        // Check for duplicate category with case-insensitive comparison using $regex
        const existingCategory = await Category.findOne({
            name: { $regex: `^${name.trim()}$`, $options: 'i' }, // Case-insensitive match
            isListed: true
        });

        if (existingCategory) {
            return res.status(400).json({ error: "Category already exists" });
        }

        // Create new category with trimmed values
        const newCategory = await Category.create({
            name: name.trim(),
            description: description.trim()
        });

        res.status(201).json({ success: "Category added successfully!", category: newCategory }); // Use 201 for created resource

    } catch (error) {
        console.error("Error adding category:", error); // Use error for consistency
        res.status(500).json({ error: "Server Error" });
    }
};

const editCategory = async (req, res) => {
    try {
        const {id, name, description } = req.body;
        // console.log("Received edit request:", { id, name, description });

        // if (!id) {
        //     console.log("Edit Category Error: Missing ID");
        //     return res.status(400).json({ error: "Category ID is required" });
        // }

        // if (!name || !name.trim()) {
        //     console.log("Edit Category Error: Name is empty");
        //     return res.status(400).json({ error: "Category name cannot be empty" });
        // }

        // Check if category exists
        const existingCategory = await Category.findById(id);
        if (!existingCategory) {
            console.log(`Edit Category Error: Category with ID ${id} not found`);
            return res.status(404).json({success:false,message:"catgory not found" });
        }

        // Check for duplicate name (excluding current category) with case-insensitive comparison
        const duplicateCategory = await Category.findOne({
            _id: { $ne: id },
            name: { $regex: `^${name.trim()}$`, $options: 'i' }, // Case-insensitive match
            isListed: true
        });

        if (duplicateCategory) {
            console.log(`Edit Category Error: Duplicate name "${name.trim()}"`);
            return res.status(400).json({success:false,message:"category with this name already exists" });
        }

        // Update the category
        const updatedCategory = await Category.findByIdAndUpdate(
            id,
            { 
                name: name.trim(), 
                description: description ? description.trim() : '' 
            },
            { new: true }
        );

        console.log("Category updated successfully:", updatedCategory);
        return res.status(200).json({ // Use 200 for successful update
            success: true,
            message:"Category updated successfully!",
            category: updatedCategory
        });

    } catch (error) {
        console.error("Error updating category:", error);
        return res.status(500).json({ 
            error: "Failed to update category. Please try again." 
        });
    }
};

const updateCategoryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await Category.findById(id);

        if (!category) {
            console.log(`Category not found: ${id}`);
            return res.status(404).json({ error: "Category not found" });
        }

        category.isListed = !category.isListed; // Toggle status
        await category.save();

        console.log(`Category Status Updated: ${category.name} (ID: ${id}) → ${category.isListed ? "Listed" : "Unlisted"}`);

        // Send updated status in response
        res.json({ 
            success: `Category ${category.isListed ? "listed" : "unlisted"} successfully!`, 
            isListed: category.isListed 
        });

    } catch (error) {
        console.log("Error updating category status:", error);
        res.status(500).json({ error: "Server Error" });
    }
};


const getEditCategoryPage = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await Category.findById(id);

        if (!category) {
            return res.status(404).send("Category not found");
        }

        res.render("admin/edit-category", { category });

    } catch (error) {
        console.log("Error loading edit page:", error);
        res.status(500).send("Server Error");
    }
};

const deleteCategory = async (req, res) => {
    try {
        const { id } = req.body;
        await Category.findByIdAndUpdate(id, { isDeleted: true });

        res.json({ success: "Category deleted successfully!" });

    } catch (error) {
        console.log("Error deleting category:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

module.exports = { getCategories, addCategory, editCategory, deleteCategory, updateCategoryStatus, getEditCategoryPage };



