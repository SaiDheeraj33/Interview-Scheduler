# GRIT Interview Scheduling

Prototype of the interview step for GRIT Track Badges: students book, interviewers set
availability and record outcomes, and the interview team tracks who has and hasn't booked.

Write-up (states, edge cases, data model, student messages): [docs/WRITEUP.md](docs/WRITEUP.md)

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev        # creates and seeds the database on first run, then serves http://localhost:3000
```

Open the home page and choose a persona. Each student is in a different state of the journey.
Demo times are relative to when the data was seeded; use **Reset demo data** on the home page
(or `npm run db:seed`) to refresh them.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Apply migrations (seeding an empty database), production build, and server |
| `npm test` | State machine rules and database double-booking tests |
| `npm run typecheck` | TypeScript check |
| `npm run db:seed` | Apply migrations and reload demo data |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |

## Where to look

Start with **Live demo** (`/live`): one interview, the interviewer's scorecard and the
student's phone side by side, updating from the same database.

| Screen | Path | Suggested persona |
|---|---|---|
| Student home: next step, countdown, result, messages | `/student` | Diya Reddy (booked), Rohan Verma (passed), Sneha Pillai (not cleared) |
| Book or reschedule a slot; add to calendar (.ics) | `/student/book/[id]` | Aarav Sharma (eligible) |
| Interviewer's day: timeline, up next, outcomes due | `/interviewer` | Priya Krishnan |
| Interview room: student's record + rubric scorecard | `/interviewer/interview/[id]` | Priya Krishnan, from her schedule |
| Availability: drag to paint a week | `/interviewer/availability` | Any interviewer |
| Team dashboard: funnel, capacity, calibration, who hasn't booked | `/team` | Sandeep Kulkarni |
| Both sides of one interview, live | `/live` | No sign-in needed |
| Before and after a result | `/before-after` | No sign-in needed |

**Demo clock** (button bottom-right on every page): journey states are derived from time,
so moving the clock forward shows interviews starting, ending and going overdue, and
waiting periods running out, without changing any data. "Jump to" lists the moments
worth seeing. It applies to every page and action in your browser.

Each persona has its own accent: indigo for students, teal for interviewers, ink and
gold for the team lead.

## How it is put together

```
src/domain/     Pure rules: policy constants, state derivation, guards, transitions, rubric (+ tests)
src/db/         Drizzle schema, client, demo seed (story personas + background history), constraint tests
src/server/     session.ts (auth seam), clock.ts (time seam), queries.ts (reads), actions.ts (every write)
src/lib/        IST time helpers; messages.ts holds every sentence a student reads
src/components/ Presentational and client components
src/app/        Routes (Next.js App Router)
drizzle/        SQL migrations
```

Stack: Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS 4,
Drizzle ORM on SQLite/libSQL, Zod, Vitest.

## Deploy

The app runs anywhere Node runs; these steps are for Vercel with a free Turso database
(a local SQLite file does not survive on serverless hosting).

1. Create a Turso database and copy its URL (`libsql://...`) and an auth token.
2. Import this repository in Vercel (framework preset: Next.js, no other settings).
3. Add the environment variables `DATABASE_URL` and `DATABASE_AUTH_TOKEN`, then deploy.

`npm run build` applies pending migrations and seeds the database if it is empty, so each
push updates the schema without manual steps. Demo times are relative to seeding: use
**Reset demo data** on the home page to bring them back to the present.

## Before production

- Replace the persona picker in `src/server/session.ts` with NIAT sign-in. `resetDemo`,
  `signInAs`, the clock actions and `recordOutcomeForDemo` in `src/server/actions.ts` are
  demo-only and must be removed, along with `/live` and `/call/[id]` (a stand-in for the
  video call; production stores the real meeting link in `bookings.meeting_url`). `getNow()` in `src/server/clock.ts`
  becomes `Date.now()`.
- Point `DATABASE_URL` at a hosted libSQL/Turso database (see `.env.example`).
- Deliver `notifications` rows by email or WhatsApp as well as in-app.
- Eligibility arrives from the contest system; here it is seeded.
