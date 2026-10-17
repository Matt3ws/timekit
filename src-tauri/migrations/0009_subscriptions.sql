-- Recurring monthly charges per customer (e.g. hosting). Each calendar month
-- from start_month (through end_month, if set) is billed once; billed_through
-- is the last month already on an invoice, updated in the same transaction
-- that issues it. Months are 'YYYY-MM' strings.
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`description` text NOT NULL,
	-- Minor units per month, priced like everything else (incl. moms when registered).
	`amount` integer NOT NULL,
	-- 'auto': issued automatically when the app opens on/after the 1st.
	-- 'review': prepared, issued with one click on the dashboard.
	`mode` text DEFAULT 'auto' NOT NULL,
	`start_month` text NOT NULL,
	`end_month` text,
	`billed_through` text,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `subscriptions_customer_idx` ON `subscriptions` (`customer_id`);
