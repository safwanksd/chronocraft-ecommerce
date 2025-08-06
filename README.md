# ChronoCraft - Full-Stack E-Commerce Platform

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white) ![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white) ![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white) ![AWS](https://img.shields.io/badge/AWS-%23232F3E.svg?style=for-the-badge&logo=amazon-aws&logoColor=white) ![Nginx](https://img.shields.io/badge/NGINX-009639?style=for-the-badge&logo=nginx&logoColor=white)

### Hey there! I’m thrilled to share ChronoCraft.
This is my first full-fledged e-commerce platform for luxury watches—a passion project I poured my heart into. As someone with a background in IT operations now diving into DevOps, this project was a pivotal step in my growth, giving me a hands-on grasp of the entire Software Development Life Cycle (SDLC)—from planning and development to live deployment on AWS.

---

## 🚀 Key Features

* **Dynamic Variant Selection:** Switch watch variants by color with real-time image updates, zoom functionality, and stock/price adjustments, powered by JavaScript and Cloudinary.
* **Secure Payment Ecosystem:** Integrated with **Razorpay** for seamless payments, paired with a user wallet system for refund credits, ensuring trust and flexibility.
* **Smart Pricing Engine:** Real-time price breakdowns at checkout with category/product offers and coupons, driven by complex MongoDB queries.
* **Interactive Admin Dashboard:** Features filterable sales charts, top 10 best-sellers, and downloadable PDF/Excel reports using MongoDB aggregation.
* **Smart Inventory Management:** Ensures stock validation during order placement and handles inventory updates on cancellations/returns using MongoDB transactions.
* **Essential Shopping Features:** Includes Add to Wishlist, Add to Cart with a dynamic header counter, and secure user authentication via **Google OAuth**.

---

## ☁️ Deployment & DevOps on AWS

I deployed ChronoCraft live on an AWS EC2 instance, handling every step from scratch with a production-ready mindset:

* **EC2 Setup:** Provisioned an Ubuntu 22.04 LTS instance in the `ap-south-1` (Mumbai) region for optimal performance.
* **Nginx Configuration:** Set up Nginx as a high-performance reverse proxy, ensuring secure HTTPS traffic and efficient request routing to the Node.js application.
* **Process Management:** Used **PM2** to manage the Node.js runtime, enabling auto-restarts, process monitoring, and high availability.
* **Security & Optimization:** Secured the server with AWS Security Groups, integrated Cloudinary for asset optimization, and implemented backup snapshots.

---

## 💻 Tech Stack

* **Frontend:** EJS, JavaScript, HTML, CSS, Bootstrap
* **Backend:** Node.js, Express.js
* **Database:** MongoDB (with Mongoose)
* **APIs & Services:** Razorpay, Cloudinary, Google OAuth, Nodemailer
* **DevOps & Deployment:** AWS EC2, Nginx, PM2, Git & GitHub

---

## 🎥 Project Demo

A complete screen-recorded video walkthrough of the live website is available on my LinkedIn. Click the link below to see the platform's features and flow in action!

➡️ **[Watch the ChronoCraft Demo on LinkedIn](https://www.linkedin.com/posts/safwan-ksd_your-post-activity-link-here)**

*(Note: Remember to replace the URL with the direct link to your LinkedIn post.)*

---

## ⚙️ Installation & Setup

To get a local copy up and running, follow these simple steps.

1.  **Clone the Repository**
    ```sh
    git clone [https://github.com/safwanksd/chronocraft.git](https://github.com/safwanksd/chronocraft.git)
    cd chronocraft
    ```

2.  **Install NPM packages**
    ```sh
    npm install
    ```

3.  **Configure Environment Variables**
    * This project requires environment variables for API keys and database connections. A template is provided in `.env.example`.
    * Create your own `.env` file by copying the example:
        ```sh
        cp .env.example .env
        ```
    * Now, open the `.env` file and add your actual keys and secrets for:
        * `MONGODB_URI`
        * `RAZORPAY_KEY_ID` & `RAZORPAY_KEY_SECRET`
        * `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`
        * `SESSION_SECRET`
        * `CLOUDINARY_URL`

4.  **Run the Application**
    ```sh
    npm start
    ```
    Visit `http://localhost:3000` in your browser.

---

## 📫 Connect With Me

I’m eager to connect with fellow developers, share my DevOps journey, and hear your thoughts!

* **LinkedIn:** [linkedin.com/in/safwan-ksd](https://www.linkedin.com/in/safwan-ksd/)
* **Email:** safwan.s27@gmail.com
