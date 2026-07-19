CREATE TABLE `app_parent_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`parent_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `app_parent_sessions_parent_idx` ON `app_parent_sessions` (`parent_id`);--> statement-breakpoint
CREATE INDEX `app_parent_sessions_expiry_idx` ON `app_parent_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `app_parent_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`must_reset_password` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_parent_users_username_idx` ON `app_parent_users` (`username`);--> statement-breakpoint
CREATE TABLE `parent_deletion_requests` (
	`request_id` text PRIMARY KEY NOT NULL,
	`parent_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `parent_deletion_requests_parent_idx` ON `parent_deletion_requests` (`parent_id`,`requested_at`);--> statement-breakpoint
CREATE INDEX `parent_deletion_requests_student_idx` ON `parent_deletion_requests` (`student_id`,`status`);--> statement-breakpoint
CREATE TABLE `parent_student_links` (
	`parent_id` text NOT NULL,
	`student_id` text NOT NULL,
	`relationship` text DEFAULT '监护人' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`parent_id`, `student_id`)
);
--> statement-breakpoint
CREATE INDEX `parent_student_links_student_idx` ON `parent_student_links` (`student_id`);--> statement-breakpoint
CREATE TABLE `user_parent_controls` (
	`user_id` text PRIMARY KEY NOT NULL,
	`interest_analysis_enabled` integer DEFAULT true NOT NULL,
	`chat_memory_enabled` integer DEFAULT true NOT NULL,
	`mistake_photo_retention_days` integer DEFAULT 365 NOT NULL,
	`chat_cleared_at` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
