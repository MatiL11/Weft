CREATE TABLE "transcripts" (
	"video_id" text PRIMARY KEY NOT NULL,
	"render_version" integer NOT NULL,
	"language" text NOT NULL,
	"segments" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "transcript_language" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "transcription_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "transcription_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_transcription_state_check" CHECK ("videos"."transcription_state" in ('none', 'queued', 'processing', 'ready', 'failed', 'no_audio'));