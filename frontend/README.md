# Kariakoo Frontend

The frontend provides sign-in, a role-aware operations overview, and a point
of sale. It uses Next.js (App Router), TypeScript, and Tailwind CSS, and runs
as a separate project alongside the backend.

## How it connects to the backend

`src/lib/api.ts` is the one place every request goes through. It:
- Reads the JWT from `localStorage` and attaches it as `Authorization: Bearer <token>`
- Points at your backend via `NEXT_PUBLIC_API_URL` (see setup below)
- If the backend ever responds with 401 (invalid/expired token), it clears
  the stored session and redirects to `/login` automatically

`src/lib/auth.ts` wraps login/logout and reading the current user, storing
the token and user info in `localStorage` after a successful login.

## Setup

Make sure your **backend is already running** (from the other project,
`npm run start:dev`, listening on whatever port you set — e.g. 3005).

```bash
npm install
cp .env.local.example .env.local
```

Open `.env.local` and set `NEXT_PUBLIC_API_URL` to match your backend's
actual port (e.g. `http://localhost:3005` if that's what you're running on).

```bash
npm run dev
```

Open http://localhost:3000 in your browser. It should redirect you to
`/login`. Log in with your seeded demo account:

```
Email:    seed-owner@example.com
Password: password123
```

A successful login redirects to the protected `/dashboard` overview. Report
figures require the signed-in role to have the backend's `reports:view`
permission.

## What's here

```
src/
  app/
    layout.tsx      Root HTML layout
    page.tsx         Redirects to /login or /dashboard based on auth state
    dashboard/       Protected operations overview and sales analytics
    login/page.tsx   The login form
    globals.css      Tailwind
  lib/
    api.ts           Shared fetch wrapper — auth header, base URL, 401 handling
    auth.ts          login()/logout()/getCurrentUser()/isLoggedIn()
```

## What's deliberately not here yet

- Product management, stock control, purchasing, and customer-management screens
- Branch filters and exportable reports
- Token refresh (matches the backend's current 8h-expiry-only design —
  revisit both together later)
