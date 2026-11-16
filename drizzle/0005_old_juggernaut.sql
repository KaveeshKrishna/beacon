ALTER TABLE "geofences" ADD COLUMN "pending_inside" boolean;--> statement-breakpoint
ALTER TABLE "geofences" ADD COLUMN "pending_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "geofences" ADD COLUMN "last_fix_at" timestamp with time zone;