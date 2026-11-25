CREATE TABLE "error_groups" (
	"fingerprint" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"where" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_request_id" text,
	"last_user_id" text,
	"sample" text,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "error_groups_last_seen_idx" ON "error_groups" USING btree ("last_seen");