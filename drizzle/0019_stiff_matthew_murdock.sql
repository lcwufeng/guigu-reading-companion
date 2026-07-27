CREATE TABLE `user_minigame_scores` (
	`user_id` text NOT NULL,
	`game_id` text NOT NULL,
	`primary_value` integer NOT NULL,
	`secondary_value` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer NOT NULL,
	`achieved_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `game_id`)
);
--> statement-breakpoint
CREATE INDEX `user_minigame_scores_game_rank_idx` ON `user_minigame_scores` (`game_id`,`primary_value`,`secondary_value`);--> statement-breakpoint
CREATE INDEX `user_minigame_scores_user_idx` ON `user_minigame_scores` (`user_id`);