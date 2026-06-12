# Telegram Referral Reward Bot

A complete, production-ready, highly secure Telegram Referral Reward Bot built with **Node.js**, **Express.js**, **Mongoose**, and the **Telegram Bot API**. This bot works exactly like the popular `BestOffer_ReferBot`, featuring a dynamic Force Join channel checker, Math Captcha anti-bot verification, automated referral tracking, a built-in withdrawal center, and an interactive administrator dashboard.

---

## 🚀 Key Features

*   **Dynamic Force Join System:** Restricts access to the bot until users join all admin-specified Telegram channels/groups. Membership status is queried in real-time.
*   **Math Captcha Account Verification:** Protects against spam scripts and user self-referral clones. Referrals only count after completing verification.
*   **Referral Engine:** Generates unique tracking links, prevents self-referrals, protects against duplicate counts, and maps referrers using robust MongoDB relations.
*   **Interactive Withdraw Center:** Dynamically lists milestone rewards, locks/unlocks claim buttons based on verified referrals, and issues pending claim requests.
*   **Telegram-Based Admin Panel (`/admin`):**
    *   Dashboard statistics (Users, Verified Users, Referrals, Claims).
    *   Dynamic required channel additions and removals.
    *   Dynamic reward level thresholds and milestone additions.
    *   Message broadcasting to all users (respects API rate limits).
    *   Pending claim manager (approve or reject withdrawals via inline buttons).
    *   CSV database exporter sent directly as a file.
*   **Abuse Protection:** Rate limiting on commands to prevent API spamming, and comprehensive error log capturing.

---

## 📁 Folder Structure

```
d:/bot/
├── src/
│   ├── config/
│   │   ├── db.js            # MongoDB Mongoose connection manager
│   │   └── index.js         # Configuration loader & validator
│   ├── models/
│   │   ├── user.model.js    # User accounts & referral references
│   │   ├── reward.model.js  # Referral reward milestones
│   │   ├── claim.model.js   # Withdrawal request tracker
│   │   ├── channel.model.js # Force-join target channels
│   │   └── settings.model.js# Global support usernames & bot status
│   ├── bot/
│   │   ├── index.js         # Telegram bot connection & router
│   │   ├── handlers.js      # Message handlers (Start, reply menus)
│   │   ├── callbacks.js     # Callback query routers (Inline buttons)
│   │   └── admin.js         # Admin panel dashboards & commands
│   ├── keyboards/
│   │   ├── reply.js         # Main navigation reply keyboards
│   │   └── inline.js        # Dynamic inline action keyboards
│   ├── middleware/
│   │   ├── auth.js          # Admin authorization checks
│   │   └── rate-limiter.js  # Anti-spam user rate-limit mapping
│   ├── services/
│   │   ├── user.service.js  # Verification & referral logic
│   │   ├── claim.service.js # Withdrawal processing logic
│   │   └── telegram.service.js # Chat member membership checks
│   ├── routes/
│   │   └── api.js           # Express Webhook & Health API routes
│   ├── utils/
│   │   ├── logger.js        # Winston logging config
│   │   └── csv.js           # CSV database formatter
│   └── server.js            # Express server entry point
├── ecosystem.config.js      # PM2 configuration for clusters
├── .env.example             # Configuration settings template
├── package.json             # Application dependencies
└── DEPLOYMENT.md            # Production deployment guide
```

---

## 🛠️ Setup & Local Installation

### 1. Prerequisites
*   Node.js (v16.x or higher)
*   npm (v7.x or higher)
*   MongoDB Atlas account (or local MongoDB running)

### 2. Installation
Clone the repository (or copy code into your directory) and install dependencies:
```bash
cd d/bot
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and configure your settings:
```bash
cp .env.example .env
```

| Variable | Description |
| :--- | :--- |
| `PORT` | Local Express server port (default `3000`). |
| `NODE_ENV` | Run mode (`development` or `production`). |
| `TELEGRAM_BOT_TOKEN` | Token obtained from [@BotFather](https://t.me/BotFather). |
| `BOT_USERNAME` | Username of your Telegram bot (e.g. `BestOffer_ReferBot`). |
| `MONGODB_URI` | Connection URI for MongoDB Atlas. |
| `ADMIN_IDS` | Comma-separated Telegram User IDs of administrators (no spaces). |
| `WEBHOOK_URL` | Production app domain. **Leave blank for local polling mode.** |

### 4. Running the Bot
For development with hot-reloading (uses nodemon):
```bash
npm run dev
```
For production:
```bash
npm start
```

---

## 📖 Telegram Command Reference

### Admin-Only Commands (`/admin` authorization required)
*   `/admin` - Opens the interactive visual admin dashboard.
*   `/users` - View current count of registered users, verified users, and unverified users.
*   `/stats` - Detailed summary of all stats including channels, claims, and rewards.
*   `/broadcast <message>` - Broadcast a markdown message to all registered bot users (safe from rate-limits).
*   `/addchannel <chatId> <Title> <inviteLink>` - Add force join channel requirement (e.g., `/addchannel @BestOfferGroup "Offer Group" https://t.me/invite`).
*   `/removechannel <chatId>` - Remove a force join channel.
*   `/addreward <requiredRefs> <Title> - <Description>` - Add/update reward milestone (e.g., `/addreward 15 Bronze Chest - Cash prize of $5`). Note the hyphen `-` separator.
*   `/removereward <requiredRefs>` - Delete a reward milestone by its required referral threshold (e.g., `/removereward 15`).
*   `/claims` - Print list of the 10 most recent claims.
*   `/pendingclaims` - List pending claims one by one with **Approve** / **Reject** buttons.
*   `/setsupport <username>` - Update support contact handle (e.g., `/setsupport @MySupport`).
*   `/togglestatus` - Toggle bot status (online/offline maintenance mode).

---

## 🛡️ Anti-Abuse & Verification Engine

1.  **Strict Verification Check:** When a user shares a referral link (`https://t.me/bot?start=ref_UID`), the referral link is stored, but **no credit is issued**.
2.  **Force-Join Gates:** The user is blocked from viewing menu options or verification captchas until they join all configured channels.
3.  **Random Math Captcha:** Once joined, they must solve a math puzzle (`A + B = ?`) presented with inline buttons. Captcha answers are validated server-side by checking the database.
4.  **Verification Reward:** When solved, the account is marked as verified, and *only then* does the referrer receive credit, accompanied by an instant Telegram notification.
5.  **Rate Limiter:** Users sending more than 3 commands/messages per second receive a warning. Excess traffic is ignored to avoid API throttling.
