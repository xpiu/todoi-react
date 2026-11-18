ALTER TABLE "items" ADD COLUMN "prior_list_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "checked_move" boolean;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_prior_list_id_lists_id_fk" FOREIGN KEY ("prior_list_id") REFERENCES "public"."lists"("id") ON DELETE set null ON UPDATE no action;