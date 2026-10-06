CREATE TABLE "operation_receipts" (
	"actor_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" integer NOT NULL,
	"body" text NOT NULL,
	"headers" jsonb NOT NULL,
	"scopes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_views" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "operation_receipts" ADD CONSTRAINT "operation_receipts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operation_receipts_actor_operation_idx" ON "operation_receipts" USING btree ("actor_id","operation_id");--> statement-breakpoint
CREATE FUNCTION todoi_increment_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER groups_version BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION todoi_increment_version();
--> statement-breakpoint
CREATE TRIGGER projects_version BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION todoi_increment_version();
--> statement-breakpoint
CREATE TRIGGER lists_version BEFORE UPDATE ON lists FOR EACH ROW EXECUTE FUNCTION todoi_increment_version();
--> statement-breakpoint
CREATE TRIGGER items_version BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION todoi_increment_version();
--> statement-breakpoint
CREATE TRIGGER labels_version BEFORE UPDATE ON labels FOR EACH ROW EXECUTE FUNCTION todoi_increment_version();
--> statement-breakpoint
CREATE TRIGGER comments_version BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION todoi_increment_version();
--> statement-breakpoint
CREATE TRIGGER saved_views_version BEFORE UPDATE ON saved_views FOR EACH ROW EXECUTE FUNCTION todoi_increment_version();
--> statement-breakpoint
-- Item details share the item's version, including relation/assignment/comment changes.
CREATE FUNCTION todoi_increment_parent_item_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE items SET version = version WHERE id = OLD.item_id;
  ELSE
    UPDATE items SET version = version WHERE id = NEW.item_id;
  END IF;
  IF TG_TABLE_NAME = 'item_relations' THEN
    IF TG_OP = 'DELETE' THEN
      UPDATE items SET version = version WHERE id = OLD.target_id;
    ELSE
      UPDATE items SET version = version WHERE id = NEW.target_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER item_labels_version AFTER INSERT OR UPDATE OR DELETE ON item_labels FOR EACH ROW EXECUTE FUNCTION todoi_increment_parent_item_version();
--> statement-breakpoint
CREATE TRIGGER item_assignees_version AFTER INSERT OR UPDATE OR DELETE ON item_assignees FOR EACH ROW EXECUTE FUNCTION todoi_increment_parent_item_version();
--> statement-breakpoint
CREATE TRIGGER item_watchers_version AFTER INSERT OR UPDATE OR DELETE ON item_watchers FOR EACH ROW EXECUTE FUNCTION todoi_increment_parent_item_version();
--> statement-breakpoint
CREATE TRIGGER item_relations_version AFTER INSERT OR UPDATE OR DELETE ON item_relations FOR EACH ROW EXECUTE FUNCTION todoi_increment_parent_item_version();
--> statement-breakpoint
CREATE TRIGGER item_comments_version AFTER INSERT OR UPDATE OR DELETE ON comments FOR EACH ROW EXECUTE FUNCTION todoi_increment_parent_item_version();
