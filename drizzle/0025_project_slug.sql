-- reviewed: additive. The column is filled for every existing project before it turns NOT NULL, and its
-- default makes the id for inserts that leave it out (older clients, tests, restores), so no write is refused.
-- A project's short public id (the link /epd5vjxy38): 10 characters from 32 lowercase letters and digits
-- without o, 0, 1 and l, with at least one digit so it never matches an app route (shared/projectLinks.ts).
CREATE FUNCTION project_slug() RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet constant text := 'abcdefghijkmnpqrstuvwxyz23456789';
  bytes bytea;
  candidate text;
BEGIN
  LOOP
    -- The first five bytes of a random UUID are all random; 256 divides by 32, so no character is favoured.
    bytes := substring(uuid_send(gen_random_uuid()) from 1 for 5) || substring(uuid_send(gen_random_uuid()) from 1 for 5);
    candidate := '';
    FOR i IN 0..9 LOOP
      candidate := candidate || substr(alphabet, 1 + get_byte(bytes, i) % 32, 1);
    END LOOP;
    EXIT WHEN candidate ~ '[2-9]' AND NOT EXISTS (SELECT 1 FROM projects WHERE projects.slug = candidate);
  END LOOP;
  RETURN candidate;
END
$$;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "projects" SET "slug" = project_slug();--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "slug" SET DEFAULT project_slug();--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_idx" ON "projects" USING btree ("slug");
