CREATE TABLE `imported_book_assets` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`kind` text DEFAULT 'illustration' NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `imported_book_assets_book_idx` ON `imported_book_assets` (`book_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `imported_book_chapters` (
	`book_id` text NOT NULL,
	`chapter_index` integer NOT NULL,
	`chapter_id` text NOT NULL,
	`title` text NOT NULL,
	`pages_json` text NOT NULL,
	PRIMARY KEY(`book_id`, `chapter_index`)
);
--> statement-breakpoint
CREATE INDEX `imported_book_chapters_book_idx` ON `imported_book_chapters` (`book_id`,`chapter_index`);--> statement-breakpoint
CREATE TABLE `imported_books` (
	`book_id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`grade` text NOT NULL,
	`summary` text NOT NULL,
	`knowledge` text NOT NULL,
	`memory_category` text NOT NULL,
	`source_label` text NOT NULL,
	`source_filename` text NOT NULL,
	`source_format` text NOT NULL,
	`source_size` integer NOT NULL,
	`extraction_mode` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`chapter_count` integer NOT NULL,
	`page_count` integer NOT NULL,
	`image_count` integer DEFAULT 0 NOT NULL,
	`quality_report_json` text DEFAULT '{}' NOT NULL,
	`created_by_admin_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`published_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `imported_books_slug_idx` ON `imported_books` (`slug`);--> statement-breakpoint
CREATE INDEX `imported_books_status_date_idx` ON `imported_books` (`status`,`updated_at`);