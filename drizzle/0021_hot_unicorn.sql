ALTER TABLE "pos_locations" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "pos_locations" AS l SET "sort_order" = o.rn FROM (SELECT "id", row_number() OVER (ORDER BY "name") AS rn FROM "pos_locations") AS o WHERE l."id" = o."id";
