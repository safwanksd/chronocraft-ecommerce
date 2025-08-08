# ChronoCraft - Full-Stack E-Commerce Platform

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white) ![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white) ![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white) ![AWS](https://img.shields.io/badge/AWS-%23232F3E.svg?style=for-the-badge&logo=amazon-aws&logoColor=white)

### Hey there! I’m thrilled to share ChronoCraft.
This is my first full-fledged e-commerce platform for luxury watches—a passion project I poured my heart into. As someone with a background in IT operations now diving into DevOps, this project was a pivotal step in my growth, giving me a hands-on grasp of the entire Software Development Life Cycle (SDLC)—from planning and development to live deployment and containerization.

---

## 🚀 Key Features

* **Dynamic Variant Selection:** Switch watch variants by color with real-time image updates, zoom functionality, and stock/price adjustments, powered by JavaScript and Cloudinary.
* **Secure Payment Ecosystem:** Integrated with **Razorpay** for seamless payments, paired with a user wallet system for refund credits, ensuring trust and flexibility.
* **Smart Pricing Engine:** Real-time price breakdowns at checkout with category/product offers and coupons, driven by complex MongoDB queries.
* **Interactive Admin Dashboard:** Features filterable sales charts, top 10 best-sellers, and downloadable PDF/Excel reports using MongoDB aggregation.
* **Smart Inventory Management:** Ensures stock validation during order placement and handles inventory updates on cancellations/returns using MongoDB transactions.
* **Essential Shopping Features:** Includes Add to Wishlist, Add to Cart with a dynamic header counter, and secure user authentication via **Google OAuth**.

---

## ☁️ Deployment & DevOps

This project showcases skills in both traditional cloud deployment and modern containerization practices, demonstrating a clear progression of my skills.

#### **1. Original Deployment on AWS**
I initially deployed ChronoCraft live on an AWS EC2 instance, handling every step from scratch to create a production-ready environment:

* **EC2 Setup:** Provisioned an Ubuntu 22.04 LTS instance.
* **Nginx Configuration:** Set up Nginx as a high-performance reverse proxy.
* **Process Management:** Used **PM2** to manage the Node.js runtime for high availability.
* **Security & Optimization:** Secured the server with AWS Security Groups and integrated Cloudinary for asset optimization.

#### **2. Local Development with Docker**
To create a consistent and reproducible development environment, the entire application has since been containerized:

* A `Dockerfile` provides the blueprint to build a clean, efficient image of the Node.js application.
* A `docker-compose.yml` file defines the entire application stack, including the application service and a MongoDB database service, connected on a private network.

---

## 💻 Tech Stack

* **Frontend:** EJS, JavaScript, HTML, CSS, Bootstrap
* **Backend:** Node.js, Express.js
* **Database:** MongoDB (with Mongoose)
* **APIs & Services:** Razorpay, Cloudinary, Google OAuth, Nodemailer
* **DevOps & Deployment:** **Docker, Docker Compose,** AWS EC2, Nginx, PM2, Git & GitHub

---

## 🎥 Project Demo

A complete screen-recorded video walkthrough of the live website is available on my LinkedIn. Click the link below to see the platform's features and flow in action!

➡️ **[Watch the ChronoCraft Demo on LinkedIn](https://www.linkedin.com/posts/safwan-ksd_chronocraft-ecommerce-fullstackdevelopment-activity-7344284612967219201-7UAV?utm_source=share&utm_medium=member_desktop&rcm=ACoAABptc8YBLOLaIzUTMBIV0xY5Fl74hLKDw9Y)**

---

## ⚙️ Local Setup (with Docker)

To get a local copy up and running, you need **Docker Desktop** installed. This is the recommended way to run the project.

1.  **Clone the Repository**
    ```sh
    git clone [https://github.com/safwanksd/chronocraft-ecommerce.git](https://github.com/safwanksd/chronocraft-ecommerce.git)
    cd chronocraft-ecommerce
    ```

2.  **Configure Environment Variables**
    * This project requires environment variables for API keys. A template is provided in `.env.example`.
    * Create your own `.env` file by copying the example:
        ```sh
        cp .env.example .env
        ```
    * Now, open the `.env` file and add your actual keys and secrets for services like Google OAuth, Razorpay, and Nodemailer. **You do not need to add a `MONGODB_URI`**, as Docker Compose handles this automatically.

3.  **Build and Run with Docker Compose**
    ```sh
    docker-compose up --build
    ```
    The application will be available at `http://localhost:3000`.

---

## 📫 Connect With Me

I’m eager to connect with fellow developers, share my DevOps journey, and hear your thoughts!

* **LinkedIn:** [linkedin.com/in/safwan-ksd](https://www.linkedin.com/in/safwan-ksd/)
* **Email:** safwan.s27@gmail.com