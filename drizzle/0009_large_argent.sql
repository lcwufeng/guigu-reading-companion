CREATE TABLE `account_login_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`account_type` text NOT NULL,
	`account_id` text NOT NULL,
	`ip_address` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_login_events_account_date_idx` ON `account_login_events` (`account_type`,`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `account_login_events_date_idx` ON `account_login_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `app_model_configs` (
	`provider_key` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`base_url` text NOT NULL,
	`secret_ciphertext` text DEFAULT '' NOT NULL,
	`secondary_secret_ciphertext` text DEFAULT '' NOT NULL,
	`updated_by_admin_id` text NOT NULL,
	`updated_at` integer NOT NULL
);
