-- Payment terms per customer (days until an invoice is due). The invoice
-- builder starts from this; 14 matches the old fixed default.
ALTER TABLE `customers` ADD `payment_terms_days` integer DEFAULT 14 NOT NULL;
