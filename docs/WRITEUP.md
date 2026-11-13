# GRIT interview scheduling: write-up

A student who has cleared every skill level for a Track Badge books a 30-minute online
"Level Clearance Interview"; an interviewer records the outcome; the badge follows.
One row per student per badge (`candidacies`) holds the journey.

## 1. States

Only five statuses are **stored** (`eligible`, `booked`, `passed`, `blocked`, `nullified`).
Anything that depends on the clock is **derived** by one pure function, so there is no
scheduled job to fall behind and every screen agrees.

| State a student is in | Moves to | What causes the move |
|---|---|---|
| **Skills pending** | Ready to book | Last required skill level cleared (event from the contest system) |
| **Ready to book** | Interview booked | Student confirms a slot |
| **Interview booked** | Ready to book | Student cancels (until 12 h before), or interviewer drops out and no colleague is free |
| | Interview booked | Student reschedules (once, until 12 h before); or interviewer drops out and a free colleague takes it at the same time |
| | Interview in progress | Start time passes *(clock)* |
| **Interview in progress** | Awaiting result | End time passes *(clock)* |
| **In progress / Awaiting result** | Badge earned | Interviewer records **Pass** |
| | Waiting period | Interviewer records **Fail** (5 days) or **No-show** (3 days) |
| | Ready to rebook | Interviewer records **Retake later** (not counted as an attempt) |
| **Waiting period** | Ready to rebook | Waiting period ends *(clock)* |
| **Ready to rebook** | Interview booked | Student confirms a slot |
| **Any state before the badge** | On hold | Team flags malpractice; any booking is cancelled |
| **Badge earned** | Badge nullified | Team flags malpractice; badge and bonus Miles removed |
| **On hold / Badge nullified** | Ready to book / Badge earned | Team clears the flag after review |

## 2. Edge cases handled, and assumptions

| Case | What happens |
|---|---|
| Two students confirm the same slot at the same moment | A partial unique index allows one live booking per slot. The loser sees "That slot was just taken" and a refreshed list. Tested with a real race. |
| Double-click, two tabs, replayed request | One live booking per candidacy, also enforced by index. |
| Student holds two badges' interviews | Overlapping times are hidden and refused. |
| Interviewer withdraws a booked slot | Cannot be switched off silently. "I can't make it" hands the interview to a free colleague at the same time; otherwise cancels at no cost to the student. |
| Interviewer never records a result | Student sees "Awaiting result", never a guess. Interviewer sees it pinned on top; team sees "outcome overdue" after 24 h. |
| Fail with no explanation | Not possible: feedback is required for Fail and Retake, and the student reads it word for word. |
| A badge depends on who took the slot | One rubric for everyone (each required skill + ownership + communication, scored 1–4). Pass/fail needs a full scorecard; an outcome that disagrees with the rubric's suggestion needs a written reason. The team sees each interviewer's pass rate against the team's and is prompted when the gap is 25+ points over 5+ interviews. |
| Wrong outcome clicked | Two-step confirm that reads back the consequence. Outcomes are then final. |
| No-show marked too early | Only allowed 10 minutes after the start. |
| Retake with the same interviewer | The previous interviewer is avoided when anyone else is free. |
| Flag raised while an interview is booked | Booking cancelled, slot released, student told. |
| No slots available | Student is told they keep eligibility; team sees open slots vs. students waiting. |
| Eligible but not booking | Team view sorts by longest wait, with a reminder limited to one per day. |
| Staff pages opened by a student | Every page and every action re-checks role and ownership on the server. |

**Assumptions** (the GRIT site does not define these; each is one constant in `src/domain/policy.ts`):
30-minute slots, 14-day booking window, 4 h minimum notice, 12 h change cutoff, one reschedule
per attempt, 5-day wait after a fail (mirrors the contest re-attempt gap), unlimited attempts,
all times IST. Students pick a **time, not an interviewer**; the least-loaded free interviewer is assigned.

**Questions for NIAT:** (1) Contest slots cannot be changed once booked; should interviews follow that, or keep the cancel/reschedule window that frees scarce interviewer time? (2) Is there a cap on interview attempts? (3) Does a flag on one contest nullify every badge that depends on that skill, and higher tiers built on it? (4) Does an interview booked before 31 Dec but held after it count for the Qualifier? (5) Can an interviewer assess students from their own campus?

**Not in the prototype:** NIAT sign-in (a persona picker stands in), email/WhatsApp delivery, outcome corrections by the team lead, recurring availability, video-call integration. The demo clock and the side-by-side view are demo tools, not product features.

## 3. Data model

Postgres (Supabase) with Drizzle; timestamps are `timestamptz`, handled as UTC milliseconds in code.

| Table | Key fields | Notes |
|---|---|---|
| `users` | id, role (student / interviewer / admin), name, campus, base_miles | |
| `badges` | id, track, tier, bonus_miles | |
| `badge_requirements` | badge_id, skill, level | Shown as the checklist |
| `skill_clearances` | student_id, skill, level, result, cleared_at | Owned by the contest system |
| `candidacies` | id, student_id, badge_id, **status**, eligible_at, bookable_from, last_outcome, attempt_count, no_show_count, reschedules_used, awarded_at, status_before_flag, flag_reason | **Unique (student, badge)**. The journey. |
| `slots` | id, interviewer_id, starts_at, ends_at, active | **Unique (interviewer, starts_at)**. Withdrawn = inactive, never deleted |
| `bookings` | id, candidacy_id, slot_id, student_id, interviewer_id, starts_at, attempt_no, status (scheduled / completed / cancelled), cancelled_by, outcome, student_feedback, internal_notes, recorded_by, recorded_at | **Unique (slot) where scheduled; unique (candidacy) where scheduled** |
| `booking_scores` | booking_id, criterion, label, score (1–4) | **PK (booking, criterion)**. The scorecard; feeds calibration |
| `events` | candidacy_id, actor_id, type, summary, created_at | Append-only audit trail |
| `notifications` | user_id, candidacy_id, kind, title, body | In-app messages; same rows would feed email |

## 4. The three messages that matter most

**Eligible** — *You're eligible for your Novice interview.* You've cleared every skill for the Novice badge in AI Product Mastery. One step left: a 30-minute online interview. Pick any open slot in the next 14 days. Earn the badge by 31 Dec 2026 to count for the Qualifier. **[Book your interview]**

**Booked** — *Interview booked: Fri, 13 Nov, 10:00 AM IST.* Your Novice · AI Product Mastery interview is with Farah Khan, 10:00 AM – 10:30 AM IST. The join link appears on your dashboard 10 minutes before the start. Need a different time? You can reschedule once, up to 12 hours before.

**Result (not cleared)** — *Not cleared this time.* You didn't clear the Novice · AI Product Mastery interview. Your skill levels and Miles are unchanged. Your interviewer's feedback: "Your Gen AI project works, but you couldn't explain how the prompt chain handles bad inputs. Revise error handling and be ready to walk through your own code line by line." You can book again from Tue, 17 Nov.

(Pass reads: *You passed. Novice badge earned.* You cleared your interview for AI Product Mastery. Your Novice badge and 500 bonus Miles are on your profile now, and you're in for the Qualifier leaderboard.)
