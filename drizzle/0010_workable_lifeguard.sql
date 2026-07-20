CREATE TABLE `parent_companion_suggestion_history` (
	`history_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`suggestion` text NOT NULL,
	`model_source` text NOT NULL,
	`generated_at` integer NOT NULL,
	`generated_by_parent_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `parent_companion_suggestion_history_user_date_idx` ON `parent_companion_suggestion_history` (`user_id`,`generated_at`);