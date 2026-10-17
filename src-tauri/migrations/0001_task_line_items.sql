CREATE TABLE IF NOT EXISTS `invoice_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`task_id` text NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
