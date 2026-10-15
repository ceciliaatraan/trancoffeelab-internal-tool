ALTER TYPE "public"."admin_role" ADD VALUE 'cashier';--> statement-breakpoint
ALTER TYPE "public"."inventory_movement_reason" ADD VALUE 'pos_sale';--> statement-breakpoint
CREATE TABLE "pos_sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_ore" integer NOT NULL,
	"tax_rate" integer NOT NULL,
	"total_ore" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pos_sale_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pos_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_number" integer GENERATED ALWAYS AS IDENTITY (sequence name "pos_sales_sale_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"status" text DEFAULT 'pending' NOT NULL,
	"location" text NOT NULL,
	"note" text,
	"payment_method" text NOT NULL,
	"total_ore" integer NOT NULL,
	"tax_ore" integer NOT NULL,
	"sold_by_admin_id" uuid,
	"sold_by_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pos_sales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "pos_sale_id" uuid;--> statement-breakpoint
ALTER TABLE "pos_sale_lines" ADD CONSTRAINT "pos_sale_lines_sale_id_pos_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sale_lines" ADD CONSTRAINT "pos_sale_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sale_lines" ADD CONSTRAINT "pos_sale_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_sold_by_admin_id_admin_users_id_fk" FOREIGN KEY ("sold_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pos_sales_created_at_idx" ON "pos_sales" USING btree ("created_at");