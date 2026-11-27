CREATE TABLE "qa_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"text" text NOT NULL,
	"url" text NOT NULL,
	"context" jsonb NOT NULL,
	"screenshot_key" text,
	"screenshot_size" integer DEFAULT 0 NOT NULL,
	"emailed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qa_reports" ADD CONSTRAINT "qa_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qa_reports_created_idx" ON "qa_reports" USING btree ("created_at");