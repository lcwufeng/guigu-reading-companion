CREATE TABLE `app_rate_limits` (
	`limit_key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`reset_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `app_rate_limits_expiry_idx` ON `app_rate_limits` (`reset_at`);--> statement-breakpoint
CREATE TABLE `app_schema_meta` (
	`schema_key` text PRIMARY KEY NOT NULL,
	`schema_version` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_minigame_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`game_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `user_minigame_runs_user_date_idx` ON `user_minigame_runs` (`user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `user_minigame_runs_expiry_idx` ON `user_minigame_runs` (`expires_at`);