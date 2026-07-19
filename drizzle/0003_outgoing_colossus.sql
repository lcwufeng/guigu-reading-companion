CREATE TABLE `app_data_migrations` (
	`migration_id` text PRIMARY KEY NOT NULL,
	`completed_at` integer NOT NULL,
	`source_backup_dir` text NOT NULL,
	`details_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chapter_answer_attempts` (
	`attempt_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`book_id` text,
	`question_key` text,
	`book_title` text NOT NULL,
	`chapter_title` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`correct` integer NOT NULL,
	`feedback` text NOT NULL,
	`model_source` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chapter_answers_user_date_idx` ON `chapter_answer_attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `chapter_answers_user_question_idx` ON `chapter_answer_attempts` (`user_id`,`question_key`,`correct`);--> statement-breakpoint
CREATE TABLE `user_active_travel` (
	`user_id` text PRIMARY KEY NOT NULL,
	`destination_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ends_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_activity_log` (
	`activity_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity` text NOT NULL,
	`detail` text NOT NULL,
	`happened_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_activity_log_user_date_idx` ON `user_activity_log` (`user_id`,`happened_at`);--> statement-breakpoint
CREATE TABLE `user_chat_messages` (
	`user_id` text NOT NULL,
	`message_id` text NOT NULL,
	`role` text NOT NULL,
	`message_text` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `message_id`)
);
--> statement-breakpoint
CREATE INDEX `user_chat_messages_expiry_idx` ON `user_chat_messages` (`expires_at`);--> statement-breakpoint
CREATE INDEX `user_chat_messages_user_date_idx` ON `user_chat_messages` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_daily_state` (
	`user_id` text NOT NULL,
	`date_key` text NOT NULL,
	`mistake_mode` text NOT NULL,
	`feed_target` integer NOT NULL,
	`swim_target` integer NOT NULL,
	`reading_target` integer NOT NULL,
	`mistake_target` integer NOT NULL,
	`feed_progress` integer NOT NULL,
	`swim_progress` integer NOT NULL,
	`reading_progress` integer NOT NULL,
	`mistake_progress` integer NOT NULL,
	`reward_claimed` integer DEFAULT false NOT NULL,
	`fruit_picked` integer DEFAULT 0 NOT NULL,
	`hide_completed` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `date_key`)
);
--> statement-breakpoint
CREATE INDEX `user_daily_state_user_date_idx` ON `user_daily_state` (`user_id`,`date_key`);--> statement-breakpoint
CREATE TABLE `user_memory_books` (
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`chapter` text NOT NULL,
	`last_read_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `title`)
);
--> statement-breakpoint
CREATE INDEX `user_memory_books_user_date_idx` ON `user_memory_books` (`user_id`,`last_read_at`);--> statement-breakpoint
CREATE TABLE `user_memory_facts` (
	`user_id` text NOT NULL,
	`fact_type` text NOT NULL,
	`fact_value` text NOT NULL,
	`source_type` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`expires_at` integer,
	PRIMARY KEY(`user_id`, `fact_type`, `fact_value`)
);
--> statement-breakpoint
CREATE INDEX `user_memory_facts_user_type_idx` ON `user_memory_facts` (`user_id`,`fact_type`,`last_used_at`);--> statement-breakpoint
CREATE TABLE `user_memory_profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`student_name` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_mistake_review_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mistake_id` text NOT NULL,
	`outcome` text NOT NULL,
	`review_number` integer NOT NULL,
	`reviewed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_mistake_reviews_user_date_idx` ON `user_mistake_review_events` (`user_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `user_mistakes` (
	`user_id` text NOT NULL,
	`mistake_id` text NOT NULL,
	`subject` text NOT NULL,
	`question` text NOT NULL,
	`wrong_answer` text NOT NULL,
	`correction` text NOT NULL,
	`cause` text NOT NULL,
	`status` text NOT NULL,
	`mistake_date` text NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`image_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `mistake_id`)
);
--> statement-breakpoint
CREATE INDEX `user_mistakes_user_status_idx` ON `user_mistakes` (`user_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `user_pet_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`pet_name` text NOT NULL,
	`hunger` integer NOT NULL,
	`cleanliness` integer NOT NULL,
	`boredom` integer NOT NULL,
	`fruits` integer NOT NULL,
	`stars` integer NOT NULL,
	`tickets` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`reading_font_size` text DEFAULT 'medium' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_reading_metrics` (
	`user_id` text NOT NULL,
	`book_id` text NOT NULL,
	`first_read_at` integer NOT NULL,
	`last_read_at` integer NOT NULL,
	`completed_at` integer,
	PRIMARY KEY(`user_id`, `book_id`)
);
--> statement-breakpoint
CREATE TABLE `user_reading_records` (
	`user_id` text NOT NULL,
	`record_id` text NOT NULL,
	`title` text NOT NULL,
	`read_date` text NOT NULL,
	`answer` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `record_id`)
);
--> statement-breakpoint
CREATE INDEX `user_reading_records_user_date_idx` ON `user_reading_records` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_reading_rewards` (
	`user_id` text NOT NULL,
	`reward_key` text NOT NULL,
	`earned_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `reward_key`)
);
--> statement-breakpoint
CREATE TABLE `user_reward_ledger` (
	`entry_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`amount` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_reward_ledger_source_idx` ON `user_reward_ledger` (`user_id`,`resource_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `user_reward_ledger_user_date_idx` ON `user_reward_ledger` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_state_meta` (
	`user_id` text PRIMARY KEY NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_travel_records` (
	`user_id` text NOT NULL,
	`record_id` text NOT NULL,
	`destination_id` text,
	`destination` text NOT NULL,
	`travel_date` text NOT NULL,
	`reward` text NOT NULL,
	`photo` text NOT NULL,
	`knowledge` text,
	`knowledge_card_id` text,
	`knowledge_title` text,
	`knowledge_facts_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `record_id`)
);
--> statement-breakpoint
CREATE INDEX `user_travel_records_user_date_idx` ON `user_travel_records` (`user_id`,`created_at`);