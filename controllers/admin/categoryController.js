// controllers/admin/categoryController.js
// Controller for managing categories, including CRUD operations and status updates

const Category = require("../../models/categorySchema");

// Retrieve all categories with pagination and search
const getCategories = async (req, res) => {
  try {
    let { search = "", page = 1, limit = 5 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const filter = {
      name: { $regex: search, $options: "i" }, // Search filter (case insensitive)
    };

    const categories = await Category.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalCategories = await Category.countDocuments(filter);

    res.render("admin/category", {
      categories,
      currentPage: page,
      totalPages: Math.ceil(totalCategories / limit),
      search,
    });
  } catch (error) {
    console.log("Error fetching categories:", error);
    res.status(500).send("Server Error");
  }
};

// Add a new category
const addCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name.trim()) {
      return res.status(400).json({ error: "Category name is required" });
    }

    // Duplicate chcek 
    const existingCategory = await Category.findOne({
      name: { $regex: `^${name.trim()}$`, $options: "i" },
      isListed: true,
    });

    if (existingCategory) {
      return res.status(400).json({ error: "Category already exists" });
    }

    // Create new category 
    const newCategory = await Category.create({
      name: name.trim(),
      description: description.trim(),
    });

    res
      .status(201)
      .json({ success: "Category added successfully!", category: newCategory });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

// Update an existing category
const editCategory = async (req, res) => {
  try {
    const { id, name, description } = req.body;

    // Category exist check
    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      return res
        .status(404)
        .json({ success: false, message: "catgory not found" });
    }

    // Duplicate name check
    const duplicateCategory = await Category.findOne({
      _id: { $ne: id },
      name: { $regex: `^${name.trim()}$`, $options: "i" },
      isListed: true,
    });

    if (duplicateCategory) {
      return res.status(400).json({
        success: false,
        message: "category with this name already exists",
      });
    }

    // Category update
    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        description: description ? description.trim() : "",
      },
      { new: true }
    );

    console.log("Category updated successfully:", updatedCategory);
    return res.status(200).json({
      success: true,
      message: "Category updated successfully!",
      category: updatedCategory,
    });
  } catch (error) {
    console.error("Error updating category:", error);
    return res.status(500).json({
      error: "Failed to update category. Please try again.",
    });
  }
};

// Toggle the listing status of a category
const updateCategoryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    category.isListed = !category.isListed; // Toggle status
    await category.save();

    // Send updated status in response
    res.json({
      success: `Category ${
        category.isListed ? "listed" : "unlisted"
      } successfully!`,
      isListed: category.isListed,
    });
  } catch (error) {
    console.log("Error updating category status:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

// Edit cat. page
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

// Delete cat. page
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

module.exports = {
  getCategories,
  addCategory,
  editCategory,
  deleteCategory,
  updateCategoryStatus,
  getEditCategoryPage,
};
