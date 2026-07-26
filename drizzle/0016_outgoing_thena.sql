CREATE TABLE `user_minigame_progress` (
	`user_id` text NOT NULL,
	`game_id` text NOT NULL,
	`completed_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `game_id`)
);
--> statement-breakpoint
CREATE INDEX `user_minigame_progress_user_date_idx` ON `user_minigame_progress` (`user_id`,`completed_at`);--> statement-breakpoint
