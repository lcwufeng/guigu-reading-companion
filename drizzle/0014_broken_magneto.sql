CREATE TABLE `user_exploration_attempts` (
	`attempt_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`node_id` text NOT NULL,
	`attempt_type` text NOT NULL,
	`answer` text NOT NULL,
	`correct` integer DEFAULT false NOT NULL,
	`feedback` text NOT NULL,
	`model_source` text DEFAULT 'local' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_exploration_attempts_user_node_idx` ON `user_exploration_attempts` (`user_id`,`node_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_exploration_learning` (
	`user_id` text NOT NULL,
	`node_id` text NOT NULL,
	`domain_id` text NOT NULL,
	`state` text DEFAULT 'learned' NOT NULL,
	`review_streak` integer DEFAULT 0 NOT NULL,
	`learned_at` integer NOT NULL,
	`next_review_at` integer DEFAULT 0 NOT NULL,
	`last_reviewed_at` integer DEFAULT 0 NOT NULL,
	`evidence_summary` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `node_id`)
);
--> statement-breakpoint
CREATE INDEX `user_exploration_learning_user_review_idx` ON `user_exploration_learning` (`user_id`,`next_review_at`);