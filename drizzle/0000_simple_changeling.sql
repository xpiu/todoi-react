CREATE TYPE "public"."item_status" AS ENUM('NEW', 'BACKLOG', 'TODO', 'DOING', 'DONE');--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"status" "item_status" DEFAULT 'TODO' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
