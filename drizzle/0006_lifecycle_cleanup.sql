CREATE TABLE "upload_cleanup" (
	"storage_key" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity" DROP CONSTRAINT "activity_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "labels" DROP CONSTRAINT "labels_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "lists" DROP CONSTRAINT "lists_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "members" DROP CONSTRAINT "members_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "saved_views" DROP CONSTRAINT "saved_views_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Preserve pre-existing orphaned subitems as top-level items before enforcing the parent link.
UPDATE "items" AS child SET "parent_item_id" = NULL
WHERE "parent_item_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "items" AS parent WHERE parent.id = child.parent_item_id);
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_parent_item_id_items_id_fk" FOREIGN KEY ("parent_item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Cascades and direct attachment deletion both enqueue cleanup, transactionally with row deletion.
CREATE FUNCTION queue_attachment_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO upload_cleanup (storage_key) VALUES (OLD.storage_key) ON CONFLICT DO NOTHING;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER attachment_cleanup_after_delete AFTER DELETE ON attachments
FOR EACH ROW EXECUTE FUNCTION queue_attachment_cleanup();
