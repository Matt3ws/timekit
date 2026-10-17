-- Optional longer description for a subscription, printed under its title on
-- the invoice line. (The existing `description` column holds the title.)
ALTER TABLE `subscriptions` ADD `details` text;
