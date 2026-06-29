CREATE TABLE `loans` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`snapshot_call_sign` text NOT NULL,
	`snapshot_serial_number` text,
	`snapshot_device_type` text,
	`borrower_name` text NOT NULL,
	`borrowed_at` integer NOT NULL,
	`returned_at` integer,
	`return_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `loans_device_id_idx` ON `loans` (`device_id`);--> statement-breakpoint
CREATE INDEX `loans_borrowed_at_idx` ON `loans` (`borrowed_at`);--> statement-breakpoint
CREATE INDEX `loans_returned_at_idx` ON `loans` (`returned_at`);--> statement-breakpoint
-- Partial unique index: at most one ACTIVE loan (returned_at IS NULL) per device.
-- Hand-added because drizzle-kit cannot emit partial indexes; it is invisible to
-- the drizzle schema, so future `drizzle-kit generate` runs neither see nor drop
-- it. Do NOT regenerate this migration file — its hash is tracked and a changed
-- hash crash-loops already-migrated databases.
CREATE UNIQUE INDEX `loans_device_active_uidx` ON `loans` (`device_id`) WHERE `returned_at` IS NULL;