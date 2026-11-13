CREATE TABLE "badge_requirements" (
	"badge_id" text NOT NULL,
	"skill" text NOT NULL,
	"level" integer NOT NULL,
	CONSTRAINT "badge_requirements_badge_id_skill_pk" PRIMARY KEY("badge_id","skill")
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" text PRIMARY KEY NOT NULL,
	"track" text NOT NULL,
	"tier" text NOT NULL,
	"bonus_miles" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_scores" (
	"booking_id" text NOT NULL,
	"criterion" text NOT NULL,
	"label" text NOT NULL,
	"score" integer NOT NULL,
	CONSTRAINT "booking_scores_booking_id_criterion_pk" PRIMARY KEY("booking_id","criterion")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"candidacy_id" text NOT NULL,
	"slot_id" text NOT NULL,
	"student_id" text NOT NULL,
	"interviewer_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"attempt_no" integer NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"cancelled_by" text,
	"cancel_reason" text,
	"outcome" text,
	"student_feedback" text,
	"internal_notes" text,
	"recorded_by" text,
	"recorded_at" timestamp with time zone,
	"meeting_url" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidacies" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"badge_id" text NOT NULL,
	"status" text DEFAULT 'eligible' NOT NULL,
	"eligible_at" timestamp with time zone NOT NULL,
	"bookable_from" timestamp with time zone,
	"last_outcome" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"no_show_count" integer DEFAULT 0 NOT NULL,
	"reschedules_used" integer DEFAULT 0 NOT NULL,
	"awarded_at" timestamp with time zone,
	"status_before_flag" text,
	"flag_reason" text,
	"flagged_at" timestamp with time zone,
	"last_nudged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"candidacy_id" text NOT NULL,
	"actor_id" text,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"candidacy_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_clearances" (
	"student_id" text NOT NULL,
	"skill" text NOT NULL,
	"level" integer NOT NULL,
	"result" text NOT NULL,
	"cleared_at" timestamp with time zone NOT NULL,
	CONSTRAINT "skill_clearances_student_id_skill_level_pk" PRIMARY KEY("student_id","skill","level")
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" text PRIMARY KEY NOT NULL,
	"interviewer_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"campus" text,
	"base_miles" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "badge_requirements" ADD CONSTRAINT "badge_requirements_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_scores" ADD CONSTRAINT "booking_scores_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_candidacy_id_candidacies_id_fk" FOREIGN KEY ("candidacy_id") REFERENCES "public"."candidacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_interviewer_id_users_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_candidacy_id_candidacies_id_fk" FOREIGN KEY ("candidacy_id") REFERENCES "public"."candidacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_candidacy_id_candidacies_id_fk" FOREIGN KEY ("candidacy_id") REFERENCES "public"."candidacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_clearances" ADD CONSTRAINT "skill_clearances_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_interviewer_id_users_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_one_live_per_slot" ON "bookings" USING btree ("slot_id") WHERE status = 'scheduled';--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_one_live_per_candidacy" ON "bookings" USING btree ("candidacy_id") WHERE status = 'scheduled';--> statement-breakpoint
CREATE INDEX "bookings_interviewer_start" ON "bookings" USING btree ("interviewer_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_student" ON "bookings" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "bookings_slot" ON "bookings" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "bookings_candidacy" ON "bookings" USING btree ("candidacy_id");--> statement-breakpoint
CREATE INDEX "bookings_recorded_by" ON "bookings" USING btree ("recorded_by");--> statement-breakpoint
CREATE UNIQUE INDEX "candidacies_student_badge" ON "candidacies" USING btree ("student_id","badge_id");--> statement-breakpoint
CREATE INDEX "candidacies_status" ON "candidacies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "candidacies_badge" ON "candidacies" USING btree ("badge_id");--> statement-breakpoint
CREATE INDEX "events_candidacy" ON "events" USING btree ("candidacy_id","created_at");--> statement-breakpoint
CREATE INDEX "events_actor" ON "events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "notifications_user" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_candidacy" ON "notifications" USING btree ("candidacy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "slots_interviewer_start" ON "slots" USING btree ("interviewer_id","starts_at");--> statement-breakpoint
CREATE INDEX "slots_start" ON "slots" USING btree ("starts_at");