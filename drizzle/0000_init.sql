CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"role" text DEFAULT 'OPERATOR' NOT NULL,
	"allowed_sessions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"user_name" text,
	"action" text NOT NULL,
	"resource" text,
	"resource_id" text,
	"session_id" text,
	"ip" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"session_id" text,
	"trigger" text DEFAULT 'message.received' NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cooldown_seconds" integer DEFAULT 60 NOT NULL,
	"times_triggered" integer DEFAULT 0 NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"type" text DEFAULT 'SEND' NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_recipients" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"contact_id" text,
	"recipient_wa_id" text NOT NULL,
	"display_name" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"wa_message_id" text,
	"rendered_body" text,
	"error_message" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"session_id" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"template_id" text,
	"body" text,
	"media_path" text,
	"media_mime_type" text,
	"media_filename" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audience" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"read_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capability_tests" (
	"method" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"last_tested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"wa_id" text NOT NULL,
	"kind" text DEFAULT 'user' NOT NULL,
	"name" text,
	"avatar_url" text,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"last_message_type" text,
	"last_message_from_me" boolean DEFAULT false,
	"is_archived" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_muted" boolean DEFAULT false NOT NULL,
	"is_read_only" boolean DEFAULT false NOT NULL,
	"assigned_user_id" text,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_custom_fields" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text
);
--> statement-breakpoint
CREATE TABLE "contact_labels" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"label_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"wa_id" text NOT NULL,
	"phone" text,
	"lid" text,
	"name" text,
	"push_name" text,
	"first_name" text,
	"last_name" text,
	"email" text,
	"company" text,
	"notes" text,
	"avatar_url" text,
	"about" text,
	"is_business" boolean DEFAULT false NOT NULL,
	"is_my_contact" boolean DEFAULT false NOT NULL,
	"is_wa_contact" boolean DEFAULT true NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"opted_in" boolean DEFAULT false NOT NULL,
	"opted_out" boolean DEFAULT false NOT NULL,
	"opt_out_at" timestamp with time zone,
	"owner_user_id" text,
	"source" text DEFAULT 'whatsapp' NOT NULL,
	"last_interaction_at" timestamp with time zone,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_field_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "event_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"session_id" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"session_id" text NOT NULL,
	"wa_id" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"wa_id" text NOT NULL,
	"subject" text,
	"description" text,
	"owner_id" text,
	"avatar_url" text,
	"participant_count" integer DEFAULT 0 NOT NULL,
	"is_announce" boolean DEFAULT false,
	"is_restricted" boolean DEFAULT false,
	"invite_link" text,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#22c55e' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "labels_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "message_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"wa_message_id" text NOT NULL,
	"campaign_id" text,
	"recipient_id" text,
	"chat_id" text NOT NULL,
	"status" text NOT NULL,
	"ack" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_media" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"session_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"mime_type" text NOT NULL,
	"filename" text,
	"size" integer,
	"storage_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"message_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"emoji" text NOT NULL,
	"timestamp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"wa_message_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"sender_id" text,
	"recipient_id" text,
	"from_me" boolean DEFAULT false NOT NULL,
	"type" text DEFAULT 'chat' NOT NULL,
	"body" text,
	"caption" text,
	"timestamp" bigint NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"ack" integer DEFAULT 0,
	"quoted_message_id" text,
	"mentioned_ids" jsonb,
	"is_forwarded" boolean DEFAULT false,
	"is_starred" boolean DEFAULT false,
	"edited" boolean DEFAULT false NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"has_media" boolean DEFAULT false NOT NULL,
	"media_mime_type" text,
	"media_filename" text,
	"media_size" integer,
	"location" jsonb,
	"vcard" text,
	"sender_name" text,
	"error_message" text,
	"metadata" jsonb,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"session_id" text,
	"message" text NOT NULL,
	"stack" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'MARKETING' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"header" text,
	"body" text NOT NULL,
	"footer" text,
	"media_path" text,
	"media_mime_type" text,
	"media_filename" text,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"buttons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"times_used" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'OPERATOR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wa_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'STOPPED' NOT NULL,
	"auto_start" boolean DEFAULT true NOT NULL,
	"phone_number" text,
	"wid" text,
	"profile_name" text,
	"profile_pic_url" text,
	"platform" text,
	"wa_version" text,
	"battery_level" integer,
	"qr_code" text,
	"qr_attempts" integer DEFAULT 0 NOT NULL,
	"qr_updated_at" timestamp with time zone,
	"last_error" text,
	"last_connected_at" timestamp with time zone,
	"last_disconnected_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"reconnect_count" integer DEFAULT 0 NOT NULL,
	"last_sync_at" timestamp with time zone,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_sessions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"response_status" integer,
	"response_body" text,
	"error" text,
	"duration_ms" integer,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"secret" text,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"session_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"retry_count" integer DEFAULT 3 NOT NULL,
	"timeout_ms" integer DEFAULT 10000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "campaign_jobs_status_idx" ON "campaign_jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_recipient_unique" ON "campaign_recipients" USING btree ("campaign_id","recipient_wa_id");--> statement-breakpoint
CREATE INDEX "campaign_recipients_status_idx" ON "campaign_recipients" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "campaign_recipients_wamsg_idx" ON "campaign_recipients" USING btree ("wa_message_id");--> statement-breakpoint
CREATE INDEX "campaigns_session_idx" ON "campaigns" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "chats_session_wa_idx" ON "chats" USING btree ("session_id","wa_id");--> statement-breakpoint
CREATE INDEX "chats_session_last_idx" ON "chats" USING btree ("session_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ccf_contact_key_idx" ON "contact_custom_fields" USING btree ("contact_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_labels_idx" ON "contact_labels" USING btree ("contact_id","label_id");--> statement-breakpoint
CREATE INDEX "contact_labels_label_idx" ON "contact_labels" USING btree ("label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_session_wa_idx" ON "contacts" USING btree ("session_id","wa_id");--> statement-breakpoint
CREATE INDEX "contacts_phone_idx" ON "contacts" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "contacts_session_idx" ON "contacts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "event_log_created_idx" ON "event_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_idx" ON "group_members" USING btree ("group_id","wa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_session_wa_idx" ON "groups" USING btree ("session_id","wa_id");--> statement-breakpoint
CREATE INDEX "deliveries_wamsg_idx" ON "message_deliveries" USING btree ("wa_message_id");--> statement-breakpoint
CREATE INDEX "deliveries_campaign_idx" ON "message_deliveries" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "message_media_msg_idx" ON "message_media" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reactions_msg_sender_idx" ON "message_reactions" USING btree ("session_id","message_id","sender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_session_waid_idx" ON "messages" USING btree ("session_id","wa_message_id");--> statement-breakpoint
CREATE INDEX "messages_chat_ts_idx" ON "messages" USING btree ("session_id","chat_id","timestamp");--> statement-breakpoint
CREATE INDEX "messages_status_idx" ON "messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_ts_idx" ON "messages" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "syslog_created_idx" ON "system_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "syslog_level_idx" ON "system_logs" USING btree ("level");--> statement-breakpoint
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wh_deliveries_webhook_idx" ON "webhook_deliveries" USING btree ("webhook_id","created_at");--> statement-breakpoint
CREATE INDEX "wh_deliveries_status_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");