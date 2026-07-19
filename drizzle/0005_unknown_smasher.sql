CREATE TABLE `user_mistake_analyses` (
	`user_id` text NOT NULL,
	`mistake_id` text NOT NULL,
	`model_source` text NOT NULL,
	`notice` text DEFAULT '' NOT NULL,
	`analyzed_at` integer NOT NULL,
	`confirmed_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `mistake_id`)
);
--> statement-breakpoint
CREATE INDEX `user_mistake_analyses_user_date_idx` ON `user_mistake_analyses` (`user_id`,`confirmed_at`);--> statement-breakpoint
CREATE TABLE `user_mistake_answer_attempts` (
	`attempt_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mistake_id` text NOT NULL,
	`answer_image_url` text NOT NULL,
	`recognized_answer` text NOT NULL,
	`recognized_steps` text NOT NULL,
	`correct` integer DEFAULT false NOT NULL,
	`feedback` text NOT NULL,
	`notice` text DEFAULT '' NOT NULL,
	`model_source` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_mistake_answers_user_date_idx` ON `user_mistake_answer_attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `user_mistake_answers_user_mistake_idx` ON `user_mistake_answer_attempts` (`user_id`,`mistake_id`,`created_at`);