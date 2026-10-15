CREATE TABLE "pos_location_users" (
	"email" text PRIMARY KEY NOT NULL,
	"location_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pos_location_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pos_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_locations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "pos_locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "receipt_email" text;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "receipt_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pos_location_users" ADD CONSTRAINT "pos_location_users_location_id_pos_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."pos_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_location_id_pos_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."pos_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "pos_locations" ("name") VALUES ('Restaurang TRAN'), ('Event') ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
UPDATE "pos_sales" AS s SET "location_id" = l."id", "location" = l."name" FROM "pos_locations" AS l WHERE (s."location" = 'restaurang_boras' AND l."name" = 'Restaurang TRAN') OR (s."location" = 'event' AND l."name" = 'Event');--> statement-breakpoint
INSERT INTO "pos_location_users" ("email", "location_id") SELECT 'linhlystudio@gmail.com', "id" FROM "pos_locations" WHERE "name" = 'Restaurang TRAN' ON CONFLICT ("email") DO NOTHING;
