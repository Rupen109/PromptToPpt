ALTER TABLE "generated_asset" ADD COLUMN "request_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "generated_asset_request_uq" ON "generated_asset" USING btree ("user_id","request_id");