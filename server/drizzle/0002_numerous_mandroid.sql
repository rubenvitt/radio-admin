ALTER TABLE `software_versions` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `software_versions` ADD `is_target` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill display order from existing creation time (newest first → highest
-- sort_order), with rowid as a stable tiebreak for equal created_at.
UPDATE `software_versions`
SET `sort_order` = (
  SELECT COUNT(*) FROM `software_versions` AS s2
  WHERE s2.`created_at` < `software_versions`.`created_at`
     OR (s2.`created_at` = `software_versions`.`created_at` AND s2.`rowid` <= `software_versions`.`rowid`)
);--> statement-breakpoint
-- Backfill the explicit target flag to match the PREVIOUS computed reference
-- (newest createdAt among versions assigned to ≥1 device), so update status is
-- unchanged immediately after migrating. The admin can re-point it afterwards.
UPDATE `software_versions`
SET `is_target` = 1
WHERE `id` = (
  SELECT sv.`id` FROM `software_versions` AS sv
  WHERE EXISTS (SELECT 1 FROM `devices` AS d WHERE d.`software_version` = sv.`value`)
  ORDER BY sv.`created_at` DESC
  LIMIT 1
);
