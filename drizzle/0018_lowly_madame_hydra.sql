CREATE TABLE `user_achievements` (
	`user_id` text NOT NULL,
	`achievement_id` text NOT NULL,
	`unlocked_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `achievement_id`)
);
--> statement-breakpoint
CREATE INDEX `user_achievements_user_date_idx` ON `user_achievements` (`user_id`,`unlocked_at`);--> statement-breakpoint
CREATE TABLE `user_title_profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`selected_achievement_id` text,
	`updated_at` integer NOT NULL
);
