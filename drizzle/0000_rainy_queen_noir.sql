CREATE TABLE `reading_progress` (
	`device_id` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter_index` integer DEFAULT 0 NOT NULL,
	`page_index` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`device_id`, `book_id`)
);
