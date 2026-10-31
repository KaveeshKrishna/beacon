CREATE TABLE "mobile_link_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"challenge" text NOT NULL,
	"state" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mobile_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"access_token_hash" text NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"previous_refresh_token_hash" text,
	"scope" text DEFAULT 'devices:read account:recover' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"ip_hash" text DEFAULT '' NOT NULL,
	"access_expires_at" timestamp with time zone NOT NULL,
	"refresh_expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enrollment_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_reset_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mobile_link_codes" ADD CONSTRAINT "mobile_link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_link_codes" ADD CONSTRAINT "mobile_link_codes_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_sessions" ADD CONSTRAINT "mobile_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_sessions" ADD CONSTRAINT "mobile_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_link_codes_hash_uq" ON "mobile_link_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "mobile_link_codes_user_idx" ON "mobile_link_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mobile_link_codes_expiry_idx" ON "mobile_link_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_sessions_access_uq" ON "mobile_sessions" USING btree ("access_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_sessions_refresh_uq" ON "mobile_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "mobile_sessions_user_idx" ON "mobile_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mobile_sessions_device_idx" ON "mobile_sessions" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "mobile_sessions_refresh_expiry_idx" ON "mobile_sessions" USING btree ("refresh_expires_at");