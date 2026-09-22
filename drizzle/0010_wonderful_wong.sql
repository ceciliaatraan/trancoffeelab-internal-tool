ALTER TYPE "public"."order_fulfillment_status" ADD VALUE 'label_created' BEFORE 'shipped';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "label_tracking_number" text;