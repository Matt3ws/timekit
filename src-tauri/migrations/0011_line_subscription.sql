-- Invoice lines that bill a subscription month remember the subscription, so
-- invoices containing subscription charges can be marked as such.
ALTER TABLE `invoice_line_items` ADD `subscription_id` text REFERENCES `subscriptions`(`id`) ON DELETE set null;
