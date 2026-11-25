ALTER TABLE "calendar_feeds" RENAME COLUMN "feed_id" TO "token";--> statement-breakpoint
ALTER TABLE "calendar_feeds" DROP CONSTRAINT "calendar_feeds_feed_id_unique";--> statement-breakpoint
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_token_unique" UNIQUE("token");--> statement-breakpoint
-- hand-written: the old links were `<feed_id><HMAC>`; a stored feed_id is no secret, so drop every feed row and
-- the next read of /me/calendar-feed makes the person a fresh random token (links change once, decision Q3).
DELETE FROM "calendar_feeds";
