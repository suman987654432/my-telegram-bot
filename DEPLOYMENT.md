# Production Deployment Guide

This guide details the step-by-step instructions for deploying your Telegram Referral Reward Bot to **Render**, **Railway**, **VPS/Ubuntu**, and setting up a free **MongoDB Atlas** database.

---

## 💾 1. MongoDB Atlas Setup

To run this bot, you require a MongoDB database. Follow these steps to set up a free cloud database:

1.  Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and sign up for a free account.
2.  Click **Create a Cluster** and choose the **M0 Shared Free Tier**. Select a cloud provider (AWS/Google Cloud) and region near your server.
3.  Go to **Database Access** under Security:
    *   Click **Add New Database User**.
    *   Select **Read and write to any database** privilege.
    *   Set a secure password. Save these credentials.
4.  Go to **Network Access** under Security:
    *   Click **Add IP Address**.
    *   Select **Allow Access From Anywhere** (`0.0.0.0/0`) for cloud deployment compatibility. Click Confirm.
5.  Go to **Database** and click **Connect**:
    *   Select **Drivers** (Node.js).
    *   Copy the connection string (looks like: `mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority`).
    *   Replace `<username>` and `<password>` with the database user details you created. Save this connection URI.

---

## 🌐 2. Deploying to Render (Webhook Mode)

Render is a premium hosting platform that supports automatic deployments from GitHub.

### Step 1: Push Project to GitHub
1.  Initialize a repository in your bot folder:
    ```bash
    git init
    git add .
    git commit -m "initial commit"
    ```
2.  Create a private GitHub repository and push your local files.

### Step 2: Create Web Service on Render
1.  Log in to [Render](https://render.com/).
2.  Click **New +** and select **Web Service**.
3.  Connect your GitHub repository.
4.  Configure the settings:
    *   **Name:** `telegram-referral-bot`
    *   **Language:** `Node`
    *   **Build Command:** `npm install`
    *   **Start Command:** `npm start`
    *   **Instance Type:** `Free` (or higher)
5.  Click **Advanced** to add Environment Variables:
    *   `NODE_ENV` = `production`
    *   `PORT` = `10000` (Render's default port)
    *   `TELEGRAM_BOT_TOKEN` = `your_telegram_bot_token`
    *   `BOT_USERNAME` = `your_bot_username_without_at`
    *   `MONGODB_URI` = `your_mongodb_atlas_connection_string`
    *   `ADMIN_IDS` = `your_comma_separated_telegram_ids`
    *   `WEBHOOK_URL` = `https://your-web-service-name.onrender.com` (Copy the URL Render assigns to your project at the top left of the dashboard).
6.  Click **Deploy Web Service**.
7.  Once deployed, the bot will communicate with Telegram using Webhook updates. You can verify it by requesting `https://your-web-service-name.onrender.com/api/health` in your browser.

---

## 🚂 3. Deploying to Railway (Webhook or Polling Mode)

Railway is an excellent platform for quick deployments, supporting both webhook mode (web service) and polling mode (background worker).

### Step 1: Deploy from GitHub or CLI
1.  Log in to [Railway](https://railway.app/).
2.  Click **New Project** -> **Deploy from GitHub repository**.
3.  Select your bot repository.

### Step 2: Setup Environment Variables
1.  Go to the **Variables** tab of your service.
2.  Add the environment variables:
    *   `TELEGRAM_BOT_TOKEN` = `your_token`
    *   `BOT_USERNAME` = `your_bot_username`
    *   `MONGODB_URI` = `your_mongodb_connection_uri`
    *   `ADMIN_IDS` = `your_admin_id`
    *   *Optional Webhook Setup:*
        *   `NODE_ENV` = `production`
        *   `PORT` = `3000`
        *   `WEBHOOK_URL` = `${{RAILWAY_STATIC_URL}}` (Railway automatically fills this with your public URL if you expose a domain in Settings -> Generate Domain).
    *   *Optional Polling Setup:*
        *   If you do **NOT** generate a domain, keep `WEBHOOK_URL` blank. The bot will automatically start in long polling mode and run as a private background worker.

---

## 🖥️ 4. Deploying to a VPS (Ubuntu) using PM2

Deploying on a Virtual Private Server (VPS) from DigitalOcean, Linode, or AWS provides maximum control and performance.

### Step 1: Install Node.js & PM2
1.  Connect to your VPS via SSH:
    ```bash
    ssh root@your_vps_ip
    ```
2.  Update system packages:
    ```bash
    sudo apt update && sudo apt upgrade -y
    ```
3.  Install Node.js (v18.x):
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    ```
4.  Install PM2 globally:
    ```bash
    sudo npm install pm2 -g
    ```

### Step 2: Clone & Configure Bot
1.  Clone your repository to the VPS:
    ```bash
    git clone https://github.com/username/telegram-referral-bot.git /opt/telegram-bot
    cd /opt/telegram-bot
    ```
2.  Install production packages:
    ```bash
    npm install --production
    ```
3.  Create the production environment file:
    ```bash
    nano .env
    ```
    Paste the values:
    ```env
    PORT=3000
    NODE_ENV=production
    TELEGRAM_BOT_TOKEN=your_token
    BOT_USERNAME=your_bot_username
    MONGODB_URI=your_mongodb_connection_uri
    ADMIN_IDS=your_admin_id
    # Keep WEBHOOK_URL blank to run in polling mode (easiest for VPS)
    WEBHOOK_URL=
    ```
    Press `CTRL+O` then `Enter` to save, and `CTRL+X` to exit.

### Step 3: Run with PM2 Process Manager
1.  Start the bot using PM2 and the configured ecosystem file:
    ```bash
    pm2 start ecosystem.config.js --env production
    ```
2.  Verify status:
    ```bash
    pm2 status
    ```
3.  Check logs:
    ```bash
    pm2 logs telegram-referral-bot
    ```
4.  Configure PM2 to restart the bot automatically if the VPS restarts:
    ```bash
    pm2 startup
    # Copy the startup command generated by PM2 and run it.
    pm2 save
    ```

---

## ⚡ Webhook vs Polling Checklist

| Feature | Polling Mode (Default) | Webhook Mode |
| :--- | :--- | :--- |
| **Requires Public URL** | No | Yes (`https` domain required) |
| **Requires Open Ports** | No | Yes (Telegram routes updates to server port) |
| **Best For** | Local Testing / VPS | Serverless / Cloud Hosting (Render/Railway) |
| **Scale Limits** | Must run exactly **1 instance** | Can run **multiple instances** (clustered) |
| **Setup Details** | Keep `WEBHOOK_URL` empty in `.env` | Put full public domain in `WEBHOOK_URL` |
