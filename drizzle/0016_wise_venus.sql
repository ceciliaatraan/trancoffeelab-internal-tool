ALTER TYPE "public"."inventory_movement_reason" ADD VALUE 'internal_use';--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN "allow_backorder" boolean DEFAULT false NOT NULL;