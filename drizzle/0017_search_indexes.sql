CREATE INDEX "comments_body_search_idx" ON "comments" USING gin (to_tsvector('simple', coalesce("body", '')));--> statement-breakpoint
CREATE INDEX "items_title_search_idx" ON "items" USING gin (to_tsvector('simple', coalesce("title", '')));--> statement-breakpoint
CREATE INDEX "items_description_search_idx" ON "items" USING gin (to_tsvector('simple', coalesce("description", '')));