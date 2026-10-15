# NoBuyZone

**A money-free item-swap platform: list what you no longer need, find what you want nearby, and trade without spending anything.**

🌐 Live at **[nobuyzone.com](https://nobuyzone.com/)**

NoBuyZone is a Turkish-language listing site built around bartering instead of buying. Users post items they want to swap, browse listings across Turkey on an interactive map, and contact each other through real-time in-app chat. The platform was built with Turkey's personal data protection law (**KVKK**) in mind, with dedicated legal pages and automated data-retention policies.

## Features

### For users
- **Interactive map homepage:** a map of Turkey built with Leaflet and OpenStreetMap that highlights the cities with active listings.
- **Listings:** create posts with a title, category, condition, description, photos and location (city, district, neighbourhood, street).
- **Drafts:** save a listing and finish it later.
- **Search and filter:** browse all listings with keyword search, filter them by category and location (city, district, neighbourhood or distance), and sort the results.
- **Real-time chat:** message other users about a listing, with typing indicators, read receipts and unread message counts, powered by Socket.IO.
- **Contact preferences:** each listing sets how the owner can be reached (in-app chat, email or phone).
- **Favourites and reporting:** save listings, or flag inappropriate ones for review.
- **Accounts:** register with email verification, log in, reset a forgotten password, change username and profile picture, control privacy settings, and delete the account.

### Categories
Electronics, Home Decoration, Pet Supplies, Food, Clothing, Gifts, Books & Stationery, Cosmetics & Personal Care, Furniture, Auto Accessories & Parts, Health & Medical, Sports & Outdoor, Technology, and Other.

### Moderation
- **Admin panel:** session-based login for administrators.
- **Listing approval:** new listings wait for admin approval before they go live.
- **Admin controls:** admins can remove users, listings and messages.
- **Forbidden Products List:** defines which items cannot be listed.

### Privacy and legal compliance
- Legal pages: User Agreement, Privacy Policy, KVKK Clarification Text, Cookie Policy and the Forbidden Products List.
- A cookie notice; only strictly necessary session cookies are used.
- **Automated data retention** with daily cron jobs:
  - Soft-deleted accounts are permanently removed after **6 months**.
  - Deleted listings and their images are permanently removed after **12 months**.
  - Database logs are rotated daily, and log files older than **2 years** are deleted.

## Tech stack

| Layer | Technologies |
|---|---|
| **Backend** | Node.js, Express 5 (ES modules) |
| **Database** | MongoDB with Mongoose |
| **Frontend** | EJS templates with `express-ejs-layouts`, vanilla JavaScript, CSS |
| **Real-time** | Socket.IO |
| **Maps** | Leaflet, OpenStreetMap, geocoding via geocode.maps.co, Turkish city/district data |
| **Auth** | Passport (JWT in HTTP-only cookies) for users; `express-session` with `connect-mongo` for admins |
| **Email** | Nodemailer (verification and password reset links) |
| **Uploads** | Multer, Cropper.js for image cropping, `file-type` validation |
| **Scheduling** | node-cron |
| **Deployment** | Docker and Docker Compose |
| **Testing** | Jest and Supertest |

## Security

- **HTTP headers:** set by Helmet.
- **Rate limiting:** a global limit, plus a stricter limit on login and registration (5 requests per 15 minutes).
- **Injection protection:** custom middleware sanitises requests against NoSQL injection.
- **Passwords:** hashed with bcrypt; password complexity enforced with Joi.
- **Email links:** verification and password reset links expire.
- **Uploads:** images are checked by their actual file contents, not just their extension, and are limited to 5 MB.
- **Cookies:** HTTP-only, `SameSite=Lax`, with an option to require HTTPS.
- **Soft deletion:** deleted users and listings are kept for a retention period before being removed permanently.

## Project structure

```
.
├── backend/
│   ├── index.mjs           # App entry: middleware, auth, routes, server
│   ├── socket-server.mjs   # Real-time chat (Socket.IO)
│   ├── cron-jobs.mjs       # Data and log retention jobs
│   ├── middlewares.mjs     # Auth checks and request sanitising
│   ├── mongoose/           # Models: User, Post, Message, Admin, EmailToken
│   ├── routes/             # Post, user, chat, upload, admin and page routes
│   ├── utils/              # Categories and chat helpers
│   ├── json/               # Turkish provinces, districts and city GeoJSON
│   └── Dockerfile
├── views/                  # EJS pages, partials, CSS and client-side JS
└── docker-compose.yml      # App and MongoDB services
```

## Getting started

### Prerequisites
- Node.js 18 or later
- MongoDB, or Docker and Docker Compose

### Environment variables

Create a `.env` file in the project root:

```env
PORT=3000
BASE_URL=http://localhost:3000
MONGODB_URI=mongodb://localhost:27017/barter-app
NODE_ENV=development

SECRETKEY=your_jwt_secret
SESSION_SECRET=your_session_secret
COOKIE_MAX_AGE=86400000
SECURE_COOKIES=false
PASSWORD_SALT_ROUNDS=10

EMAIL_USER=your_email@example.com
EMAIL_FROM=your_email@example.com
APP_PASSWORD=your_email_app_password

GEOCODING_API_KEY=your_geocode_maps_co_key
MIN_REQUEST_INTERVAL=1000
```

### Run with Docker (recommended)

```bash
docker compose up --build
```

The app runs on `http://localhost:3000`. MongoDB is exposed on port `27018`, so it doesn't clash with a local MongoDB on `27017`.

### Run locally

```bash
cd backend
npm install
npm start
```

### Run tests

```bash
cd backend
npm test
```

## Live site

Visit **[nobuyzone.com](https://nobuyzone.com/)** to try it out.
