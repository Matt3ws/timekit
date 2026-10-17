-- Bill per time entry instead of per task, add the indexes and constraints the
-- billing rules rely on, and the columns for sequential numbering and issued
-- invoices (seller snapshot, service period, credit notes).

-- An invoice claims individual time entries. UNIQUE(time_entry_id): an entry
-- can be billed at most once. RESTRICT: an entry on an issued invoice can't be
-- deleted (credit the invoice first, which releases its entries).
CREATE TABLE `invoice_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`time_entry_id` text NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`time_entry_id`) REFERENCES `time_entries`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE UNIQUE INDEX `invoice_entries_time_entry_unique` ON `invoice_entries` (`time_entry_id`);
CREATE INDEX `invoice_entries_invoice_idx` ON `invoice_entries` (`invoice_id`);

-- Backfill: every finished entry on a billed task that existed when its invoice
-- was created belongs to that invoice.
INSERT INTO `invoice_entries` (`id`, `invoice_id`, `time_entry_id`)
SELECT lower(hex(randomblob(12))), it.invoice_id, te.id
FROM `invoice_tasks` it
JOIN `time_entries` te ON te.task_id = it.task_id
JOIN `invoices` i ON i.id = it.invoice_id
WHERE te.ended_at IS NOT NULL AND te.started_at <= i.created_at;

-- One line per task on hourly invoices: remember which task a line bills.
-- Rebuilt instead of ALTER ... ADD: databases created by an early version of
-- migration 2 already have an (always empty) task_id column, fresh ones don't.
CREATE TABLE `invoice_line_items_new` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`project_id` text,
	`task_id` text,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit_price` integer DEFAULT 0 NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`entries_json` text,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
INSERT INTO `invoice_line_items_new` (`id`, `invoice_id`, `project_id`, `description`, `quantity`, `unit_price`, `amount`, `entries_json`)
SELECT `id`, `invoice_id`, `project_id`, `description`, `quantity`, `unit_price`, `amount`, `entries_json`
FROM `invoice_line_items`;
DROP TABLE `invoice_line_items`;
ALTER TABLE `invoice_line_items_new` RENAME TO `invoice_line_items`;

UPDATE `invoice_line_items`
SET `task_id` = (
	SELECT t.id FROM `invoice_tasks` it
	JOIN `tasks` t ON t.id = it.task_id
	WHERE it.invoice_id = invoice_line_items.invoice_id
		AND t.project_id = invoice_line_items.project_id
		AND (invoice_line_items.description = t.title
			OR invoice_line_items.description LIKE t.title || char(10) || '%')
	LIMIT 1
);

DROP TABLE `invoice_tasks`;

-- At most one running timer.
CREATE UNIQUE INDEX `time_entries_one_running` ON `time_entries` ((`ended_at` IS NULL)) WHERE `ended_at` IS NULL;

-- Foreign-key indexes (the tracked/billed subqueries scanned whole tables).
CREATE INDEX `projects_customer_idx` ON `projects` (`customer_id`);
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`);
CREATE INDEX `time_entries_task_idx` ON `time_entries` (`task_id`);
CREATE INDEX `invoices_customer_idx` ON `invoices` (`customer_id`);
CREATE INDEX `invoice_line_items_invoice_idx` ON `invoice_line_items` (`invoice_id`);
CREATE INDEX `invoice_line_items_project_idx` ON `invoice_line_items` (`project_id`);
CREATE INDEX `task_links_task_idx` ON `task_links` (`task_id`);

-- Sequential invoice numbers: the next number to issue. Starts after the
-- invoices that already exist.
ALTER TABLE `settings` ADD `invoice_number_next` integer DEFAULT 1 NOT NULL;
UPDATE `settings` SET `invoice_number_next` = (SELECT count(*) + 1 FROM `invoices`);

-- Issued invoices: what kind of document, the seller's details at issue time
-- (so a regenerated PDF never picks up later settings), the service period,
-- and for a credit note the invoice it credits.
ALTER TABLE `invoices` ADD `kind` text DEFAULT 'invoice' NOT NULL;
ALTER TABLE `invoices` ADD `seller_json` text;
ALTER TABLE `invoices` ADD `period_start` integer;
ALTER TABLE `invoices` ADD `period_end` integer;
ALTER TABLE `invoices` ADD `credited_invoice_id` text REFERENCES `invoices`(`id`) ON DELETE restrict;
