CREATE TABLE `badge_requirements` (
	`badge_id` text NOT NULL,
	`skill` text NOT NULL,
	`level` integer NOT NULL,
	PRIMARY KEY(`badge_id`, `skill`),
	FOREIGN KEY (`badge_id`) REFERENCES `badges`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `badges` (
	`id` text PRIMARY KEY NOT NULL,
	`track` text NOT NULL,
	`tier` text NOT NULL,
	`bonus_miles` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`candidacy_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`student_id` text NOT NULL,
	`interviewer_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`attempt_no` integer NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`cancelled_by` text,
	`cancel_reason` text,
	`outcome` text,
	`student_feedback` text,
	`internal_notes` text,
	`recorded_by` text,
	`recorded_at` integer,
	`meeting_url` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`candidacy_id`) REFERENCES `candidacies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`slot_id`) REFERENCES `slots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`interviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_one_live_per_slot` ON `bookings` (`slot_id`) WHERE status = 'scheduled';--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_one_live_per_candidacy` ON `bookings` (`candidacy_id`) WHERE status = 'scheduled';--> statement-breakpoint
CREATE INDEX `bookings_interviewer_start` ON `bookings` (`interviewer_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `bookings_student` ON `bookings` (`student_id`);--> statement-breakpoint
CREATE TABLE `candidacies` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`badge_id` text NOT NULL,
	`status` text DEFAULT 'eligible' NOT NULL,
	`eligible_at` integer NOT NULL,
	`bookable_from` integer,
	`last_outcome` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`no_show_count` integer DEFAULT 0 NOT NULL,
	`reschedules_used` integer DEFAULT 0 NOT NULL,
	`awarded_at` integer,
	`status_before_flag` text,
	`flag_reason` text,
	`flagged_at` integer,
	`last_nudged_at` integer,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`badge_id`) REFERENCES `badges`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidacies_student_badge` ON `candidacies` (`student_id`,`badge_id`);--> statement-breakpoint
CREATE INDEX `candidacies_status` ON `candidacies` (`status`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`candidacy_id` text NOT NULL,
	`actor_id` text,
	`type` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`candidacy_id`) REFERENCES `candidacies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_candidacy` ON `events` (`candidacy_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`candidacy_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidacy_id`) REFERENCES `candidacies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_user` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `skill_clearances` (
	`student_id` text NOT NULL,
	`skill` text NOT NULL,
	`level` integer NOT NULL,
	`result` text NOT NULL,
	`cleared_at` integer NOT NULL,
	PRIMARY KEY(`student_id`, `skill`, `level`),
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `slots` (
	`id` text PRIMARY KEY NOT NULL,
	`interviewer_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`interviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slots_interviewer_start` ON `slots` (`interviewer_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `slots_start` ON `slots` (`starts_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`campus` text,
	`base_miles` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);