CREATE TYPE "public"."item_priority" AS ENUM('URGENT', 'HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."list_kind" AS ENUM('project', 'inbox');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."project_view" AS ENUM('list', 'board', 'calendar');--> statement-breakpoint
CREATE TYPE "public"."project_visibility" AS ENUM('private', 'shared', 'public');--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"key_prefix" text NOT NULL,
	"next_item_number" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"owner_id" text NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "list_kind" DEFAULT 'project' NOT NULL,
	"project_id" text,
	"user_id" text,
	"name" text NOT NULL,
	"icon" text,
	"status_role" "item_status",
	"position" integer DEFAULT 0 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'editor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"description" text,
	"visibility" "project_visibility" DEFAULT 'private' NOT NULL,
	"default_view" "project_view" DEFAULT 'list' NOT NULL,
	"link_statuses" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"nickname" text,
	"avatar_color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "list_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "created_by" text;--> statement-breakpoint
-- Backfill (hand-written): until sign-in exists every item belongs to one local account's Inbox.
INSERT INTO "users" ("id", "name", "email", "nickname", "avatar_color") VALUES ('local_user_000000000a', 'Local user', 'local@todoi.local', 'me', 'blue') ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "lists" ("id", "kind", "user_id", "name") VALUES ('local_inbox_00000000a', 'inbox', 'local_user_000000000a', 'Inbox') ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "items" SET "list_id" = 'local_inbox_00000000a', "created_by" = 'local_user_000000000a' WHERE "list_id" IS NULL;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "list_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "parent_item_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "key_number" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "prior_status" "item_status";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "priority" "item_priority";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "due_time" time;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "repeat_rule" jsonb;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "repeat_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "cover" jsonb;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "notification" jsonb;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "unread" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lists_project_idx" ON "lists" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lists_inbox_per_user_idx" ON "lists" USING btree ("user_id") WHERE "lists"."kind" = 'inbox';--> statement-breakpoint
CREATE UNIQUE INDEX "members_pk_idx" ON "members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "projects_group_idx" ON "projects" USING btree ("group_id");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_list_idx" ON "items" USING btree ("list_id","position");--> statement-breakpoint
CREATE INDEX "items_project_idx" ON "items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "items_parent_idx" ON "items" USING btree ("parent_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "items_key_per_project_idx" ON "items" USING btree ("project_id","key_number");