CREATE TABLE `account_admin_state` (
	`account_type` text NOT NULL,
	`account_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_login_at` integer DEFAULT 0 NOT NULL,
	`created_by_admin_id` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`account_type`, `account_id`)
);
--> statement-breakpoint
CREATE INDEX `account_admin_state_status_idx` ON `account_admin_state` (`account_type`,`status`);--> statement-breakpoint
CREATE TABLE `admin_audit_logs` (
	`event_id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`admin_username` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`summary` text NOT NULL,
	`ip_address` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_audit_logs_date_idx` ON `admin_audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_logs_admin_idx` ON `admin_audit_logs` (`admin_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `app_admin_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `app_admin_sessions_admin_idx` ON `app_admin_sessions` (`admin_id`);--> statement-breakpoint
CREATE INDEX `app_admin_sessions_expiry_idx` ON `app_admin_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `app_admin_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'super_admin' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`must_reset_password` integer DEFAULT true NOT NULL,
	`last_login_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_admin_users_username_idx` ON `app_admin_users` (`username`);--> statement-breakpoint
CREATE TABLE `service_health_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`service` text NOT NULL,
	`operation` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `service_health_events_service_date_idx` ON `service_health_events` (`service`,`created_at`);--> statement-breakpoint
CREATE INDEX `service_health_events_status_date_idx` ON `service_health_events` (`status`,`created_at`);