-- Supabase publishes every table in the public schema through its REST/GraphQL Data API.
-- This app never uses that API: the server connects to Postgres directly as the table owner.
-- Row level security with no policies denies the API's anon and authenticated roles
-- everything, while the owner (and plain Postgres, as in local development) is unaffected.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "badges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "badge_requirements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "skill_clearances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "candidacies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
