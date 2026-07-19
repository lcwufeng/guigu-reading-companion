CREATE TABLE `parent_companion_refreshes` (
	`user_id` text NOT NULL,
	`date_key` text NOT NULL,
	`refresh_id` text NOT NULL,
	`parent_id` text NOT NULL,
	`requested_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `date_key`)
);
--> statement-breakpoint
CREATE INDEX `parent_companion_refreshes_parent_idx` ON `parent_companion_refreshes` (`parent_id`,`requested_at`);--> statement-breakpoint
CREATE TABLE `parent_companion_suggestions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`suggestion` text NOT NULL,
	`model_source` text NOT NULL,
	`generated_at` integer NOT NULL,
	`generated_by_parent_id` text NOT NULL
);
