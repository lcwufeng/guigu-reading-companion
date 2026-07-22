CREATE TABLE `user_minigame_daily` (
	`user_id` text NOT NULL,
	`date_key` text NOT NULL,
	`game_id` text NOT NULL,
	`plays` integer DEFAULT 0 NOT NULL,
	`best_score` integer DEFAULT 0 NOT NULL,
	`total_caught` integer DEFAULT 0 NOT NULL,
	`reward_claimed` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `date_key`, `game_id`)
);
--> statement-breakpoint
CREATE INDEX `user_minigame_daily_user_date_idx` ON `user_minigame_daily` (`user_id`,`date_key`);