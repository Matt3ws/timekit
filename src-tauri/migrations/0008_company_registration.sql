-- When the business was registered (CVR start date). A "personlig mindre
-- virksomhed" must renew its registration on virk.dk every 3 years; the app
-- counts down to that date.
ALTER TABLE `settings` ADD `company_registered_at` integer;
