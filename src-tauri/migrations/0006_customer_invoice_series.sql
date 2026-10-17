-- Invoice numbers run in one series per customer (Danish rules allow several
-- series as long as every number is unique): prefix + the customer's series
-- code + that customer's own sequence, e.g. "Cc-FIN-00001". Also the language
-- the customer's invoices are written in.
ALTER TABLE `customers` ADD `invoice_code` text;
ALTER TABLE `customers` ADD `invoice_number_next` integer DEFAULT 1 NOT NULL;
ALTER TABLE `customers` ADD `invoice_language` text DEFAULT 'da' NOT NULL;
CREATE UNIQUE INDEX `customers_invoice_code_unique` ON `customers` (`invoice_code` COLLATE NOCASE);
