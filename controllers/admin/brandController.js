// brandController.js

const Brand = require("../../models/brandSchema");
const { upload, resizeBrandImage } = require("../../middlewares/multer");

const getBrands = async (req, res) => {
    try {
        let { search = "", page = 1, limit = 5 } = req.query;
        console.log(search)
        page = parseInt(page);
        limit = parseInt(limit);

        const filter = {
            brandName: { $regex: search, $options: "i" }
        };

        const brands = await Brand.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const totalBrands = await Brand.countDocuments(filter);

        res.render("admin/brands", {
            brands,
            currentPage: page,
            totalPages: Math.ceil(totalBrands / limit),
            search
        });

    } catch (error) {
        console.log("Error fetching brands:", error);
        res.status(500).send("Server Error");
    }
};

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
        console.log("Error adding brand:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

const editBrand = async (req, res) => {
    try {
        const { id, brandName } = req.body;

        if (!brandName.trim()) {
            return res.status(400).json({ error: "Brand name cannot be empty!" });
        }

        await Brand.findByIdAndUpdate(id, { brandName: brandName.trim() });
        res.json({ success: "Brand updated successfully!" });

    } catch (error) {
        console.log("Error updating brand:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

// Delete (Soft Delete) Brand
const deleteBrand = async (req, res) => {
    try {
        const { id } = req.body;
        await Brand.findByIdAndDelete(id);

        res.json({ success: "Brand deleted successfully!" });

    } catch (error) {
        console.log("Error deleting brand:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

// Block/Unblock Brand
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
        console.log("Error toggling brand status:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

const getEditBrandPage = async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        
        if (!brand) {
            console.log(`Brand not found: ${req.params.id}`);
            return res.status(404).send("Brand Not Found");
        }

        res.render("admin/edit-brand", { brand });
    } catch (error) {
        console.log("Error loading edit page:", error);
        res.status(500).send("Server Error");
    }
};



module.exports = { getBrands, addBrand, editBrand, deleteBrand, toggleBrandStatus, getEditBrandPage };
