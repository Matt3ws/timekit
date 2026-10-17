-- Bookkeeping for a small Danish sole proprietorship: whether the business is
-- moms-registered (a "personlig mindre virksomhed" isn't, until 50.000 kr of
-- turnover in 12 months), expenses with their receipts, and backups.

-- 1 = moms-registered: invoices carry the default VAT rate. 0 = not
-- registered: invoices carry 0% and the PDF says so.
ALTER TABLE `settings` ADD `vat_registered` integer DEFAULT 1 NOT NULL;
-- Folder that daily backups are written to (null = backups off), and when the
-- last one was taken.
ALTER TABLE `settings` ADD `backup_dir` text;
ALTER TABLE `settings` ADD `last_backup_at` integer;

-- One purchase: what, from whom, how much, and the receipt (bilag) kept with it.
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`date` integer NOT NULL,
	`supplier` text NOT NULL,
	`description` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	-- Minor units: what was paid in total, moms included.
	`amount` integer NOT NULL,
	-- Minor units: the deductible moms in `amount` (0 while not moms-registered).
	`vat_amount` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'DKK' NOT NULL,
	-- The receipt, copied into the app's data folder.
	`receipt_path` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
CREATE INDEX `expenses_date_idx` ON `expenses` (`date`);
CREATE INDEX `invoices_issue_date_idx` ON `invoices` (`issue_date`);
