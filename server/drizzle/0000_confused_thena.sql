CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE TABLE `device_events` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`changed_by` text,
	`changed_at` integer NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `device_events_device_id_idx` ON `device_events` (`device_id`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`rufname` text,
	`issi` text NOT NULL,
	`serial_number` text,
	`device_type` text,
	`status` text,
	`location` text,
	`assigned_to` text,
	`software_version` text,
	`last_updated_at` integer,
	`notes` text,
	`hiorg_id` text,
	`opta` text,
	`funktion` text,
	`hersteller` text,
	`bedieneinheit` text,
	`device_modes` text,
	`alamos_integrated` integer,
	`loanable` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_issi_unique` ON `devices` (`issi`);--> statement-breakpoint
CREATE TABLE `software_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `software_versions_value_unique` ON `software_versions` (`value`);--> statement-breakpoint
CREATE TABLE `users` (
	`sub` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`last_seen_at` integer NOT NULL
);
