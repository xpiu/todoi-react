-- Move activity written before the shared STATUS_NAMES said "— Status set to TODO" (the raw id); name the Status as the app does now.
UPDATE "activity" SET "text" = regexp_replace("text", '— Status set to NEW$', '— Status set to New') WHERE "text" LIKE '%— Status set to NEW';--> statement-breakpoint
UPDATE "activity" SET "text" = regexp_replace("text", '— Status set to BACKLOG$', '— Status set to Backlog') WHERE "text" LIKE '%— Status set to BACKLOG';--> statement-breakpoint
UPDATE "activity" SET "text" = regexp_replace("text", '— Status set to TODO$', '— Status set to To-do') WHERE "text" LIKE '%— Status set to TODO';--> statement-breakpoint
UPDATE "activity" SET "text" = regexp_replace("text", '— Status set to DOING$', '— Status set to Doing') WHERE "text" LIKE '%— Status set to DOING';--> statement-breakpoint
UPDATE "activity" SET "text" = regexp_replace("text", '— Status set to DONE$', '— Status set to Done') WHERE "text" LIKE '%— Status set to DONE';--> statement-breakpoint
UPDATE "activity" SET "text" = regexp_replace("text", '— Status set to null$', '— Status set to None') WHERE "text" LIKE '%— Status set to null';
