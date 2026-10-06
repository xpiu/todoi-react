-- Ensure version functions/triggers exist even when an early 0009 schema-only migration was applied.
CREATE OR REPLACE FUNCTION todoi_increment_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS groups_version ON groups;
--> statement-breakpoint
CREATE TRIGGER groups_version BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION todoi_increment_version();
--> statement-breakpoint
DROP TRIGGER IF EXISTS projects_version ON projects;
--> statement-breakpoint
CREATE TRIGGER projects_version BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION todoi_increment_version();
--> statement-breakpoint
DROP TRIGGER IF EXISTS lists_version ON lists;
--> statement-breakpoint
CREATE TRIGGER lists_version BEFORE UPDATE ON lists FOR EACH ROW EXECUTE FUNCTION todoi_increment_version();
--> statement-breakpoint
DROP TRIGGER IF EXISTS items_version ON items;
--> statement-breakpoint
CREATE TRIGGER items_version BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION todoi_increment_version();
--> statement-breakpoint
DROP TRIGGER IF EXISTS labels_version ON labels;
--> statement-breakpoint
CREATE TRIGGER labels_version BEFORE UPDATE ON labels FOR EACH ROW EXECUTE FUNCTION todoi_increment_version();
--> statement-breakpoint
DROP TRIGGER IF EXISTS comments_version ON comments;
--> statement-breakpoint
CREATE TRIGGER comments_version BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION todoi_increment_version();
--> statement-breakpoint
DROP TRIGGER IF EXISTS saved_views_version ON saved_views;
--> statement-breakpoint
CREATE TRIGGER saved_views_version BEFORE UPDATE ON saved_views FOR EACH ROW EXECUTE FUNCTION todoi_increment_version();
--> statement-breakpoint
-- Item details share the item's version, including relation/assignment/comment changes.
CREATE OR REPLACE FUNCTION todoi_increment_parent_item_version() RETURNS trigger LANGUAGE plpgsql AS $$
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
DROP TRIGGER IF EXISTS item_labels_version ON item_labels;
--> statement-breakpoint
CREATE TRIGGER item_labels_version AFTER INSERT OR UPDATE OR DELETE ON item_labels FOR EACH ROW EXECUTE FUNCTION todoi_increment_parent_item_version();
--> statement-breakpoint
DROP TRIGGER IF EXISTS item_assignees_version ON item_assignees;
--> statement-breakpoint
CREATE TRIGGER item_assignees_version AFTER INSERT OR UPDATE OR DELETE ON item_assignees FOR EACH ROW EXECUTE FUNCTION todoi_increment_parent_item_version();
--> statement-breakpoint
DROP TRIGGER IF EXISTS item_watchers_version ON item_watchers;
--> statement-breakpoint
CREATE TRIGGER item_watchers_version AFTER INSERT OR UPDATE OR DELETE ON item_watchers FOR EACH ROW EXECUTE FUNCTION todoi_increment_parent_item_version();
--> statement-breakpoint
DROP TRIGGER IF EXISTS item_relations_version ON item_relations;
--> statement-breakpoint
CREATE TRIGGER item_relations_version AFTER INSERT OR UPDATE OR DELETE ON item_relations FOR EACH ROW EXECUTE FUNCTION todoi_increment_parent_item_version();
--> statement-breakpoint
DROP TRIGGER IF EXISTS item_comments_version ON comments;
--> statement-breakpoint
CREATE TRIGGER item_comments_version AFTER INSERT OR UPDATE OR DELETE ON comments FOR EACH ROW EXECUTE FUNCTION todoi_increment_parent_item_version();
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
DROP TRIGGER IF EXISTS attachments_version ON attachments;
--> statement-breakpoint
CREATE TRIGGER attachments_version BEFORE UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION todoi_increment_version();
--> statement-breakpoint
DROP TRIGGER IF EXISTS item_attachments_version ON attachments;
--> statement-breakpoint
CREATE TRIGGER item_attachments_version AFTER INSERT OR UPDATE OR DELETE ON attachments FOR EACH ROW EXECUTE FUNCTION todoi_increment_parent_item_version();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION todoi_increment_comment_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE comments SET version = version WHERE id = OLD.comment_id;
  ELSE
    UPDATE comments SET version = version WHERE id = NEW.comment_id;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS comment_reactions_version ON comment_reactions;
--> statement-breakpoint
CREATE TRIGGER comment_reactions_version AFTER INSERT OR UPDATE OR DELETE ON comment_reactions FOR EACH ROW EXECUTE FUNCTION todoi_increment_comment_version();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION todoi_increment_project_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE projects SET version = version WHERE id = OLD.project_id;
  ELSE
    UPDATE projects SET version = version WHERE id = NEW.project_id;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS members_project_version ON members;
--> statement-breakpoint
CREATE TRIGGER members_project_version AFTER INSERT OR UPDATE OR DELETE ON members FOR EACH ROW EXECUTE FUNCTION todoi_increment_project_version();
--> statement-breakpoint
DROP TRIGGER IF EXISTS invites_project_version ON invites;
--> statement-breakpoint
CREATE TRIGGER invites_project_version AFTER INSERT OR UPDATE OR DELETE ON invites FOR EACH ROW EXECUTE FUNCTION todoi_increment_project_version();
