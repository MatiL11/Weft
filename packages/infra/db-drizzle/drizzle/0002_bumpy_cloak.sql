ALTER TABLE "videos" DROP CONSTRAINT "videos_privacy_check";--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "trim_start_ms" integer;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "trim_end_ms" integer;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "render_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "render_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "render" jsonb;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_render_state_check" CHECK ("videos"."render_state" in ('none', 'queued', 'processing', 'ready', 'failed'));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_trim_check" CHECK (("videos"."trim_start_ms" is null) = ("videos"."trim_end_ms" is null));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_password_check" CHECK (("videos"."privacy" = 'password') = ("videos"."password_hash" is not null));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_privacy_check" CHECK ("videos"."privacy" in ('link', 'workspace', 'password', 'private'));