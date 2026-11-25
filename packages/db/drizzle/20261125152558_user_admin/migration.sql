CREATE TYPE "admin_action_kind" AS ENUM('user.disable', 'user.enable', 'user.sign_out', 'user.delete', 'user.role', 'user.two_factor.require', 'user.two_factor.unrequire', 'user.two_factor.reset');--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"action" "admin_action_kind" NOT NULL,
	"target_user_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_client_id" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "impersonated_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ban_expires" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "admin_actions_target_user_id_created_at_idx" ON "admin_actions" ("target_user_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_actions_actor_user_id_idx" ON "admin_actions" ("actor_user_id");--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_actor_user_id_users_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonated_by_users_id_fkey" FOREIGN KEY ("impersonated_by") REFERENCES "users"("id") ON DELETE SET NULL;