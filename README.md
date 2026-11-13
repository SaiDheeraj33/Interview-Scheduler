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

No database server is needed locally: without `DATABASE_URL` the app runs an embedded
Postgres (PGlite) stored in `./data`. Stop the dev server before running `npm run db:seed`.

Open the home page and choose a persona. Each student is in a different state of the journey.
Demo times are relative to when the data was seeded; use **Reset demo data** on the home page
(or `npm run db:seed`) to refresh them.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Apply migrations (seeding an empty database), production build, and server |
| `npm test` | State machine and rubric rules, plus database double-booking tests on Postgres |
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
Drizzle ORM on Postgres (Supabase in production, embedded PGlite locally and in tests), Zod, Vitest.

## Deploy

The app runs anywhere Node runs; these steps are for Vercel with a Supabase Postgres database.

1. In Supabase, open the project → **Connect** → **Transaction pooler** and copy the
   connection string (port 6543), with the database password filled in.
2. Import this repository in Vercel (framework preset: Next.js, no other settings).
3. Add the environment variable `DATABASE_URL` with that connection string, then deploy.

`vercel.json` pins the server functions to Mumbai (`bom1`), next to the database in
`ap-south-1`; a database page makes several queries, so keeping both in one region
matters more than anything else for speed. Change both together if you move regions.

`npm run build` applies pending migrations and seeds the database if it is empty, so each
push updates the schema without manual steps. Demo times are relative to seeding: use
**Reset demo data** on the home page to bring them back to the present.

## Before production

- Replace the persona picker in `src/server/session.ts` with NIAT sign-in. `resetDemo`,
  `signInAs`, the clock actions and `recordOutcomeForDemo` in `src/server/actions.ts` are
  demo-only and must be removed, along with `/live` and `/call/[id]` (a stand-in for the
  video call; production stores the real meeting link in `bookings.meeting_url`). `getNow()` in `src/server/clock.ts`
  becomes `Date.now()`.
- The server connects to Postgres directly as the table owner. Supabase's Data API is not
  used; row level security with no policies (migration `0001`) keeps it closed. Adding
  client-side Supabase access later means writing policies first.
- Deliver `notifications` rows by email or WhatsApp as well as in-app.
- Eligibility arrives from the contest system; here it is seeded.
