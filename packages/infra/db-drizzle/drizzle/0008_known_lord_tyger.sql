CREATE TABLE "views" (
	"id" text PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"viewer_id" text,
	"anonymous_id" text,
	"timeline_key" text NOT NULL,
	"buckets" integer NOT NULL,
	"watched_ms" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "views" ADD CONSTRAINT "views_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "views" ADD CONSTRAINT "views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "views_video_id_started_at_index" ON "views" USING btree ("video_id","started_at");