CREATE TABLE "git_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"provider" text DEFAULT 'github' NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"path" text NOT NULL,
	"format" text NOT NULL,
	"token_cipher" text NOT NULL,
	"token_hint" text NOT NULL,
	"created_by" text,
	"file_sha" text,
	"base" jsonb,
	"last_synced_at" timestamp with time zone,
	"state" text DEFAULT 'ok' NOT NULL,
	"last_error" text,
	"conflict_policy" text DEFAULT 'ask' NOT NULL,
	"pending" jsonb,
	"auto_sync" boolean DEFAULT true NOT NULL,
	"hook_id" integer,
	"hook_secret_cipher" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "git_connections_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "git_sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"actor_id" text,
	"trigger" text NOT NULL,
	"outcome" text NOT NULL,
	"pulled" integer DEFAULT 0 NOT NULL,
	"pushed" integer DEFAULT 0 NOT NULL,
	"conflicts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"notes" jsonb,
	"before" jsonb,
	"commit_sha" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "file_origin" jsonb;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "sync_extra" jsonb;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "git_connections" ADD CONSTRAINT "git_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_connections" ADD CONSTRAINT "git_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_sync_runs" ADD CONSTRAINT "git_sync_runs_connection_id_git_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."git_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_sync_runs" ADD CONSTRAINT "git_sync_runs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "git_sync_runs_connection_idx" ON "git_sync_runs" USING btree ("connection_id","created_at");--> statement-breakpoint
CREATE INDEX "items_external_idx" ON "items" USING btree ("project_id","external_id");--> statement-breakpoint
-- Recording a list's or item's id in the synced file is bookkeeping, not an edit: it must not make anyone's
-- queued change stale. Such an update keeps the row's version; every other update still bumps it.
CREATE OR REPLACE FUNCTION todoi_increment_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  touched jsonb;
  resource text;
  initial_version integer;
BEGIN
  -- Only when the file id itself changed: a no-op update (SET version = version) is how related rows bump an item.
  IF TG_TABLE_NAME IN ('items', 'lists') THEN
    IF (to_jsonb(NEW) -> 'external_id') IS DISTINCT FROM (to_jsonb(OLD) -> 'external_id')
       AND (to_jsonb(NEW) - ARRAY['external_id', 'updated_at', 'version']) = (to_jsonb(OLD) - ARRAY['external_id', 'updated_at', 'version']) THEN
      NEW.version := OLD.version;
      RETURN NEW;
    END IF;
  END IF;
  NEW.version := OLD.version + 1;
  touched := nullif(current_setting('todoi.sync_versions', true), '')::jsonb;
  IF touched IS NOT NULL THEN
    resource := replace(TG_TABLE_NAME, '_', '-') || '/' || NEW.id;
    initial_version := coalesce((touched -> resource ->> 'before')::integer, OLD.version);
    touched := jsonb_set(touched, ARRAY[resource], jsonb_build_object('before', initial_version, 'after', NEW.version), true);
    PERFORM set_config('todoi.sync_versions', touched::text, true);
  END IF;
  RETURN NEW;
END;
$$;
