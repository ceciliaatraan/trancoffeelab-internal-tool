ALTER TABLE "products" ADD COLUMN "is_preorder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "expected_ship_date" date;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "contains_preorder" boolean DEFAULT false NOT NULL;