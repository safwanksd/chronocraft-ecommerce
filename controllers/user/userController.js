

const pageNotFound = async (req, res) => {
    try {
        res.render("page-404")
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}

const loadHomepage = async (req, res) => {
    try {
        return res.render("home")
    } catch (error) {
        console.log(`Error page not found`);
        res.status(404).send("Server Error")
    }
}

module.exports = {
    loadHomepage, 
    pageNotFound,
};