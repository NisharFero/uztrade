CREATE TABLE `case_blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`case_id` text NOT NULL,
	`block_id` text NOT NULL,
	`state` text DEFAULT 'waiting' NOT NULL,
	`started_at` text,
	`completed_at` text,
	`actual_hours` real
);
--> statement-breakpoint
CREATE INDEX `case_blocks_case_idx` ON `case_blocks` (`case_id`);--> statement-breakpoint
CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`procedure_id` text NOT NULL,
	`title` text NOT NULL,
	`goods` text DEFAULT '' NOT NULL,
	`query` text DEFAULT '' NOT NULL,
	`matched_by` text DEFAULT 'rules' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
