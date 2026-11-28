CREATE TABLE "github_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"token_cipher" text NOT NULL,
	"refresh_cipher" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "git_connections" ALTER COLUMN "token_cipher" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "git_connections" ADD COLUMN "installation_id" bigint;--> statement-breakpoint
ALTER TABLE "git_connections" ADD COLUMN "repo_id" bigint;--> statement-breakpoint
ALTER TABLE "github_accounts" ADD CONSTRAINT "github_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;