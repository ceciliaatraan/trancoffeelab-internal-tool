CREATE TABLE "pending_business_purchases" (
	"kustom_order_id" text PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"business_vat_number" text NOT NULL,
	"business_address" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_business_purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_business_purchase" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "business_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "business_vat_number" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "business_address" jsonb;