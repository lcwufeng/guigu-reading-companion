CREATE TABLE `legacy_unassigned_data` (
	`source_type` text NOT NULL,
	`source_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`imported_at` integer NOT NULL,
	PRIMARY KEY(`source_type`, `source_key`)
);
