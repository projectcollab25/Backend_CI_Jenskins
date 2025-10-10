# reservation_app_backend
A production-ready, modular Express boilerplate for the reservation_app_backend project.

Project layout

reservation_app_backend/
├── src/
│   ├── routes/
│   │   ├── roomsRoutes.js
│   │   ├── bookingsRoutes.js
│   │   └── authRoutes.js
│   ├── controllers/
│   ├── models/
│   ├── config/
│   │   └── db.js
│   └── server.js
├── .env.example
├── package.json
├── README.md
└── .gitignore

Prerequisites

- Node.js v20 or later (recommended). If you use nvm, run `nvm use` (see `.nvmrc`).
- npm (comes with Node.js) or Docker.

Quick start (local)

```bash
# clone
git clone <repo-url>
cd reservation_app_backend

# install dependencies
npm install

# copy env file and edit values
cp .env.example .env
# edit .env as needed (DATABASE_URL etc.)

# start the server
npm start

# then open http://localhost:3000
```

Run with Docker (optional)

```bash
docker build -t reservation_app_backend .
docker run -p 3000:3000 reservation_app_backend
```

Notes

- This project uses ES Modules (`"type": "module"` in `package.json`).
- Server entrypoint: `src/server.js`. The app dynamically loads route files from `src/routes` and mounts them under sensible base paths (`/rooms`, `/book`, `/auth`).
- Add your DB credentials to `.env` and implement `src/config/db.js` to connect to your chosen datastore.

Next steps

- Implement controllers and models for rooms, bookings and auth.
- Add validation, logging, error handling and tests before production deployment.

Database migrations

This repo includes a simple SQL-based migration system using `migrations/*.sql` and a runner `scripts/migrate.js`.

How to run migrations

1. Add your database URL to `.env` (this file is gitignored). Example in `.env.example`:

	DATABASE_URL=postgresql://postgres:your_password@db.host:5432/postgres?sslmode=require

2. Run migrations:

```bash
# installs dependencies (if you haven't already)
npm install

# runs migrations (applies 001_schema.sql then 002_seed.sql)
npm run migrate
```

Notes

- The migration runner connects using SSL (configured to work with Supabase). It will abort if `DATABASE_URL` is not provided.
- The SQL in `migrations/001_schema.sql` drops existing tables (`users`, `rooms`, `bookings`) and recreates them, then `002_seed.sql` inserts sample rows. Back up production data before running in a live database.
- For a more advanced setup (production CI migrations, safe rollbacks), consider using a dedicated migration tool such as Prisma Migrate, Flyway, or node-pg-migrate.
