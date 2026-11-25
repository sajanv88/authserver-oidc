CREATE TABLE "oauth_pushed_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"request_uri_hash" text NOT NULL,
	"client_id" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_pushed_requests_request_uri_hash_key" ON "oauth_pushed_requests" ("request_uri_hash");--> statement-breakpoint
CREATE INDEX "oauth_pushed_requests_client_id_idx" ON "oauth_pushed_requests" ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_pushed_requests_expires_at_idx" ON "oauth_pushed_requests" ("expires_at");--> statement-breakpoint
ALTER TABLE "oauth_pushed_requests" ADD CONSTRAINT "oauth_pushed_requests_client_id_oauth_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE;