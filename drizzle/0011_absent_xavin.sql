CREATE TABLE "order_line_component_swaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_line_id" uuid NOT NULL,
	"original_component_product_id" uuid NOT NULL,
	"new_product_id" uuid NOT NULL,
	"new_variant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_line_component_swaps_unique" UNIQUE("order_line_id","original_component_product_id")
);
--> statement-breakpoint
ALTER TABLE "order_line_component_swaps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_line_component_swaps" ADD CONSTRAINT "order_line_component_swaps_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_component_swaps" ADD CONSTRAINT "order_line_component_swaps_original_component_product_id_products_id_fk" FOREIGN KEY ("original_component_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_component_swaps" ADD CONSTRAINT "order_line_component_swaps_new_product_id_products_id_fk" FOREIGN KEY ("new_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_component_swaps" ADD CONSTRAINT "order_line_component_swaps_new_variant_id_product_variants_id_fk" FOREIGN KEY ("new_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;