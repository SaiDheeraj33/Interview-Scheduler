CREATE TABLE `booking_scores` (
	`booking_id` text NOT NULL,
	`criterion` text NOT NULL,
	`label` text NOT NULL,
	`score` integer NOT NULL,
	PRIMARY KEY(`booking_id`, `criterion`),
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action
);
