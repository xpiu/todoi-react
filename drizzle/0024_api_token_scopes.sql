ALTER TABLE "api_tokens" ADD COLUMN "access" text DEFAULT 'write' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "project_ids" text[];