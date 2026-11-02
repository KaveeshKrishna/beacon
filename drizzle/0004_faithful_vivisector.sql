CREATE TABLE "device_reconnect_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"challenge" text NOT NULL,
	"state" text NOT NULL,
	"install_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "install_hash" text;--> statement-breakpoint
ALTER TABLE "device_reconnect_codes" ADD CONSTRAINT "device_reconnect_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_reconnect_codes" ADD CONSTRAINT "device_reconnect_codes_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_reconnect_codes_hash_uq" ON "device_reconnect_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "device_reconnect_codes_user_idx" ON "device_reconnect_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_reconnect_codes_expiry_idx" ON "device_reconnect_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_install_uq" ON "devices" USING btree ("user_id","install_hash") WHERE "devices"."install_hash" is not null;