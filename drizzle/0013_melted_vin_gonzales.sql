CREATE TABLE `user_exploration_progress` (
	`user_id` text NOT NULL,
	`node_id` text NOT NULL,
	`domain_id` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`completed_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `node_id`)
);
--> statement-breakpoint
CREATE INDEX `user_exploration_progress_user_date_idx` ON `user_exploration_progress` (`user_id`,`updated_at`);