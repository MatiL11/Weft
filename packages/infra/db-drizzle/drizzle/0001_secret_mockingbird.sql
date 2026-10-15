CREATE TABLE "video_segments" (
	"video_id" text NOT NULL,
	"kind" text NOT NULL,
	"index" integer NOT NULL,
	"start_ms" integer NOT NULL,
	"byte_length" bigint NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_at" timestamp with time zone,
	CONSTRAINT "video_segments_video_id_kind_index_pk" PRIMARY KEY("video_id","kind","index"),
	CONSTRAINT "video_segments_kind_check" CHECK ("video_segments"."kind" in ('init', 'media'))
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"privacy" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	CONSTRAINT "videos_status_check" CHECK ("videos"."status" in ('recording', 'ready')),
	CONSTRAINT "videos_privacy_check" CHECK ("videos"."privacy" in ('link', 'workspace', 'private'))
);
--> statement-breakpoint
ALTER TABLE "video_segments" ADD CONSTRAINT "video_segments_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "videos_workspace_id_created_at_index" ON "videos" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "videos_owner_id_index" ON "videos" USING btree ("owner_id");