-- The brand is written lower case ("todoi", README › About), and so is the sample account named after it: the seeded
-- owners (info@todoi.org, gates@todoi.org) and the seeded texts that name them. Exact matches only; anything a person edited stays.
UPDATE "users" SET "name" = 'todoi' WHERE "name" = 'Todoi' AND "email" IN ('info@todoi.org', 'gates@todoi.org');--> statement-breakpoint
UPDATE "projects" SET "description" = 'The shop and the public pages for both dealers. Sam takes the shop side, todoi takes the pages.' WHERE "description" = 'The shop and the public pages for both dealers. Sam takes the shop side, Todoi takes the pages.';--> statement-breakpoint
UPDATE "items" SET "description" = replace("description", 'Sam takes the shop side, Todoi takes the pages.', 'Sam takes the shop side, todoi takes the pages.') WHERE "title" = 'Helicopters Europe launch plan' AND "description" LIKE '%Sam takes the shop side, Todoi takes the pages.%';--> statement-breakpoint
UPDATE "items" SET "description" = replace("description", '> @Todoi both dealers want the price hidden', '> @todoi both dealers want the price hidden') WHERE "description" LIKE '> @Todoi both dealers want the price hidden%';--> statement-breakpoint
UPDATE "items" SET "title" = 'Sync conflict on MP-112 — changed in todoi and on GitHub' WHERE "title" = 'Sync conflict on MP-112 — changed in Todoi and on GitHub';--> statement-breakpoint
UPDATE "items" SET "title" = replace("title", 'Todoi 2.1 is out:', 'todoi 2.1 is out:') WHERE "title" LIKE 'Todoi 2.1 is out:%';
