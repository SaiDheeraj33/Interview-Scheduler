# GRIT Interview Scheduling: write-up

**Prototype:** https://interview-scheduler-navy-nine.vercel.app · **Code:** https://github.com/SaiDheeraj33/Interview-Scheduler

A student who clears every skill level for a Track Badge books a 30-minute online Level Clearance
Interview; an interviewer scores it on a shared rubric; the badge follows. One row per student per
badge (`candidacies`) holds the journey.

## 1. States

Only five statuses are **stored** (`eligible`, `booked`, `passed`, `blocked`, `nullified`). Everything
that depends on the clock is **derived** by one pure function, so no scheduled job can fall behind
and every screen agrees.

| State | Moves to | Cause |
|---|---|---|
| **Skills pending** | Ready to book | Last required skill level cleared (event from the contest system) |
| **Ready to book / rebook** | Interview booked | Student confirms a slot |
| **Interview booked** | Ready to book | Student cancels (until 12 h before), or interviewer drops out and no colleague is free |
| | Interview booked | Student reschedules (once, until 12 h before), or a free colleague takes over at the same time |
| | In progress → Awaiting result | Start time, then end time, passes *(clock)* |
| **In progress / Awaiting result** | Badge earned | Interviewer records **Pass** |
| | Waiting period | **Fail** (5 days) or **No-show** (3 days) |
| | Ready to rebook | **Retake later** (not counted as an attempt) |
| **Waiting period** | Ready to rebook | Waiting period ends *(clock)* |
| **Any state before the badge** | On hold | Team flags malpractice; any booking is cancelled |
| **Badge earned** | Badge nullified | Team flags malpractice; badge and bonus Miles removed |
| **On hold / Nullified** | Previous state | Team clears the flag after review |

## 2. Edge cases, assumptions and questions

| Case | What happens |
|---|---|
| Two students confirm the same slot at once | A partial unique index allows one live booking per slot; the other sees "That slot was just taken". Writes run in serializable transactions. Tested with a real race, locally and on the live site. |
| Double-click, two tabs, replayed request | One live booking per candidacy, also enforced by an index. Two badges' interviews can't overlap. |
| Interviewer withdraws a booked slot | Can't be switched off silently. "I can't make it" hands it to a free colleague at the same time, else cancels at no cost to the student. |
| Result never recorded | Student sees "Awaiting result", never a guess; the interviewer sees it pinned; the team sees "overdue" after 24 h. |
| Outcome depends on who took the slot | One rubric for all (each required skill + ownership + communication, 1–4). Pass/fail needs a full scorecard; overriding the rubric's suggestion needs a written reason. The team sees each interviewer's pass rate against the team's, flagged at a 25+ point gap over 5+ interviews. |
| A fail with no way forward | Feedback is required and shown word for word. A **prep pack** shows the same rubric in the student's words, and on a retake their last feedback plus the criteria that held them back. Internal notes stay private. |
| Wrong click, or no-show marked too early | Two-step confirm that reads back the consequence; no-show only 10 min after the start. |
| Retake with the same interviewer | Avoided when anyone else is free. |
| No slots, or eligible but not booking | Eligibility is kept; the team sees open slots against students waiting, sorted by longest wait, with a once-a-day reminder. |
| Staff pages opened by a student | Every page and action re-checks role and ownership on the server. |

**Assumptions** (one constant each in `src/domain/policy.ts`): 30-minute slots, 14-day window, 4 h
minimum notice, 12 h change cutoff, one reschedule per attempt, 5-day wait after a fail (mirrors the
contest gap), unlimited attempts, IST. Students pick a **time, not an interviewer**; the least-loaded
free interviewer is assigned.

**Questions for NIAT:** (1) Contest slots can't be changed once booked; should interviews match, or keep
a cancel window that frees scarce interviewer time? (2) Is there a cap on attempts? (3) Does one flagged
contest nullify every badge built on that skill? (4) Does an interview booked before 31 Dec but held
after count for the Qualifier? (5) Can interviewers assess students from their own campus?

## 3. Data model

Postgres (Supabase) via Drizzle; `timestamptz` throughout.

| Table | Key fields | Constraints and notes |
|---|---|---|
| `users` | id, role (student / interviewer / admin), name, campus, base_miles | |
| `badges`, `badge_requirements` | track, tier, bonus_miles; (badge, skill, level) | Requirements drive the checklist and the rubric |
| `skill_clearances` | student, skill, level, result, cleared_at | Owned by the contest system |
| `candidacies` | student, badge, **status**, bookable_from, last_outcome, attempt_count, reschedules_used, awarded_at, status_before_flag | **Unique (student, badge)**. The journey |
| `slots` | interviewer, starts_at, ends_at, active | **Unique (interviewer, starts_at)**; withdrawn = inactive, never deleted |
| `bookings` | candidacy, slot, student, interviewer, starts_at, attempt_no, status, outcome, student_feedback, internal_notes, recorded_by | **Unique (slot) and unique (candidacy) where scheduled** |
| `booking_scores` | booking, criterion, score (1–4) | The scorecard; feeds calibration and the prep pack |
| `events`, `notifications` | candidacy, actor, type, summary; user, title, body | Append-only audit trail; in-app messages (same rows would feed email) |

## 4. What I'd build next

1. **Waitlist with automatic offers.** A freed slot is held 15 minutes for the longest-waiting student. *Metric:* slot use, days from eligible to interview.
2. **"Still coming?" check.** Confirm at 24 h and 3 h; an unconfirmed slot goes to the waitlist 1 h before. *Metric:* no-show rate, interviewer minutes recovered.
3. **Demand forecast.** Students one skill away are next week's demand: "about 38 eligible, 22 slots open". *Metric:* wait before the 31 Dec deadline.
4. **Fairness loop.** One question after each result ("Did it feel fair?") and a 48 h review request after a fail, seen beside the interviewer's calibration. *Metric:* reversal rate per interviewer.
