CREATE TABLE "product_bundle_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_product_id" uuid NOT NULL,
	"component_product_id" uuid NOT NULL,
	"component_variant_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_bundle_items_component_unique" UNIQUE("bundle_product_id","component_product_id","component_variant_id")
);
--> statement-breakpoint
ALTER TABLE "product_bundle_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_bundle_items" ADD CONSTRAINT "product_bundle_items_bundle_product_id_products_id_fk" FOREIGN KEY ("bundle_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bundle_items" ADD CONSTRAINT "product_bundle_items_component_product_id_products_id_fk" FOREIGN KEY ("component_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bundle_items" ADD CONSTRAINT "product_bundle_items_component_variant_id_product_variants_id_fk" FOREIGN KEY ("component_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_bundle_items_bundle_idx" ON "product_bundle_items" USING btree ("bundle_product_id");