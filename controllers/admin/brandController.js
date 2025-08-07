// brandController.js
// Controller for managing brands, including CRUD operations and status toggling

const Brand = require("../../models/brandSchema");
const { upload, resizeBrandImage } = require("../../middlewares/multer");

// Retrieve all brands with pagination and search
const getBrands = async (req, res) => {
  try {
    let { search = "", page = 1, limit = 5 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const filter = { brandName: { $regex: search, $options: "i" } };

    const brands = await Brand.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalBrands = await Brand.countDocuments(filter);

    res.render("admin/brands", {
      brands,
      currentPage: page,
      totalPages: Math.ceil(totalBrands / limit),
      search,
    });
  } catch (error) {
    console.error("Error fetching brands:", error);
    res.status(500).send("Server Error");
  }
};

// Add a new brand
const addBrand = async (req, res) => {
  try {
    const { brandName } = req.body;

    if (!brandName || !brandName.trim()) {
      return res.status(400).json({ error: "Brand name is required!" });
    }

    const existingBrand = await Brand.findOne({ brandName: brandName.trim() });
    if (existingBrand) {
      return res.status(400).json({ error: "Brand already exists!" });
    }

    await Brand.create({ brandName: brandName.trim() });
    res.json({ success: "Brand added successfully!" });
  } catch (error) {
    console.error("Error adding brand:", error);
    res.status(500).json({ error: "Server Error" }); 
  }
};

// Update an existing brand
const editBrand = async (req, res) => {
  try {
    const { id, brandName } = req.body;

    if (!brandName.trim()) {
      return res.status(400).json({ error: "Brand name cannot be empty!" });
    }

    await Brand.findByIdAndUpdate(id, { brandName: brandName.trim() });
    res.json({ success: "Brand updated successfully!" });
  } catch (error) {
    console.error("Error updating brand:", error); // Essential log
    res.status(500).json({ error: "Server Error" });
  }
};

// Delete a brand (soft delete)
const deleteBrand = async (req, res) => {
  try {
    const { id } = req.body;
    await Brand.findByIdAndDelete(id);

    res.json({ success: "Brand deleted successfully!" });
  } catch (error) {
    console.error("Error deleting brand:", error); // Essential log
    res.status(500).json({ error: "Server Error" });
  }
};

// Toggle the block status of a brand
const toggleBrandStatus = async (req, res) => {
  try {
    const { id } = req.body;
    const brand = await Brand.findById(id);

    if (!brand) {
      return res.status(404).json({ error: "Brand not found!" });
    }

    brand.isBlocked = !brand.isBlocked;
    await brand.save();

    res.json({ success: `Brand ${brand.isBlocked ? "blocked" : "unblocked"} successfully!` });
  } catch (error) {
    console.error("Error toggling brand status:", error); // Essential log
    res.status(500).json({ error: "Server Error" });
  }
};

// Render the edit brand page
const getEditBrandPage = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);

    if (!brand) {
      return res.status(404).send("Brand Not Found");
    }

    res.render("admin/edit-brand", { brand });
  } catch (error) {
    console.error("Error loading edit page:", error); // Essential log
    const isApiRequest = req.xhr || req.headers['accept']?.includes('application/json');
    if (isApiRequest) {
      return res.status(500).json({ error: "Server Error" });
    }
    res.status(500).send("Server Error");
  }
};

module.exports = { 
    getBrands, 
    addBrand, 
    editBrand, 
    deleteBrand, 
    toggleBrandStatus, 
    getEditBrandPage 
};