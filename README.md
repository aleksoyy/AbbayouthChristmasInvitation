# Abbayouth Christmas Event Registration System

Full-stack web app for QR-based guest registration, unique lottery numbers (1–500), admin dashboard, and Excel export.

## Stack
- Node.js 20+
- Express REST API
- PostgreSQL 16
- Prisma ORM
- Vanilla JS responsive frontend
- ExcelJS for `.xlsx`, `qrcode` for registration QR

## Features
- Mobile-first guest registration form.
- Required: name, Indonesian mobile number, address.
- Optional: mentor, church, information source.
- Backend validation and rate limiting.
- Random unique lottery number allocation with PostgreSQL row locking (`FOR UPDATE SKIP LOCKED`).
- Request idempotency token to protect against repeated submission.
- Success page with the assigned number.
- Admin login with bcrypt password hashing and an HTTP-only session cookie.
- Dashboard summary, search, date filter, sorting, pagination.
- Full dataset Excel export (not limited to the visible page).
- Admin-only QR code generator.
- Asia/Jakarta timestamp display/export.

## Run locally

Requirements: Node.js 20+, npm, Docker Desktop (or another PostgreSQL server).

1. Copy `.env.example` to `.env`.
2. Change `JWT_SECRET` to a long random value and set a strong `ADMIN_PASSWORD`.
3. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

4. Install packages:

   ```bash
   npm install
   ```

5. Generate Prisma client and create database tables:

   ```bash
   npm run db:generate
   npm run db:dev
   ```

6. Seed lottery numbers 1–500 and create the admin account:

   ```bash
   npm run db:seed
   ```

7. Start the app:

   ```bash
   npm run dev
   ```

8. Open:
   - Guest: http://localhost:3000/register
   - Admin: http://localhost:3000/admin

Use `ADMIN_USERNAME` and `ADMIN_PASSWORD` from `.env` to log in.

## Create the registration QR
Log in to `/admin` and select **QR REGISTRASI**. The QR points to `${APP_BASE_URL}/register`.
For an event deployment, set `APP_BASE_URL` to the public HTTPS URL, then restart the server.

## Production deployment checklist
1. Provision a managed PostgreSQL database or secured PostgreSQL server.
2. Set `DATABASE_URL`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `APP_BASE_URL`, `NODE_ENV=production`, and `PORT` in the hosting provider's environment settings.
3. Use HTTPS. The admin cookie is marked `Secure` when `NODE_ENV=production`.
4. Run `npm ci`, `npm run db:generate`, `npm run db:migrate`, and `npm run db:seed` for the first deployment. Do not rerun seed with a changed admin password unless you intend to reset it.
5. Configure automated database backups and test restore.
6. Restrict database network access and use a strong database password.
7. Set up monitoring and test the registration flow from a real mobile phone using the deployed QR code.

## Important notes
- This project is a deployable application source code, but it is not hosted online by this package. You need a server/database and public domain to make the QR code accessible to event guests.
- Phone numbers are not forced unique because the supplied requirements did not specify a one-registration-per-phone rule.
- The success ticket is shown in the browser session after a successful registration. Guests should save a screenshot; the number is also retained in the database/admin export.
- Admin credentials must be changed from the example values before deployment.
- Use `npm run db:dev` for local development. Use `npm run db:migrate` for production migrations.
