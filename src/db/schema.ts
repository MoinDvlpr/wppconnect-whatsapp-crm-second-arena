import {
  pgTable, text, integer, boolean, timestamp, jsonb, bigint, index, uniqueIndex, serial,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey();
const now = (n: string) => timestamp(n, { withTimezone: true }).defaultNow().notNull();

// ---------- Auth ----------
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("OPERATOR"), // ADMIN | OPERATOR | VIEWER
  createdAt: now("created_at"),
});

export const userSessions = pgTable("user_sessions", {
  id: id(),
  userId: text("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: now("created_at"),
}, (t) => [index("user_sessions_user_idx").on(t.userId)]);

export const apiKeys = pgTable("api_keys", {
  id: id(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  role: text("role").notNull().default("OPERATOR"),
  allowedSessions: jsonb("allowed_sessions").$type<string[]>().default([]).notNull(), // empty = all
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: now("created_at"),
});

// ---------- WhatsApp sessions ----------
export const waSessions = pgTable("wa_sessions", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("STOPPED"), // STOPPED|STARTING|QR|AUTHENTICATING|CONNECTED|READY|DISCONNECTED|ERROR
  autoStart: boolean("auto_start").notNull().default(true),
  phoneNumber: text("phone_number"),
  wid: text("wid"),
  profileName: text("profile_name"),
  profilePicUrl: text("profile_pic_url"),
  platform: text("platform"),
  waVersion: text("wa_version"),
  batteryLevel: integer("battery_level"),
  qrCode: text("qr_code"),
  qrAttempts: integer("qr_attempts").notNull().default(0),
  qrUpdatedAt: timestamp("qr_updated_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
  lastDisconnectedAt: timestamp("last_disconnected_at", { withTimezone: true }),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  reconnectCount: integer("reconnect_count").notNull().default(0),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
});

// ---------- Contacts (CRM + WhatsApp side) ----------
export const contacts = pgTable("contacts", {
  id: id(),
  sessionId: text("session_id").notNull(),
  waId: text("wa_id").notNull(), // e.g. 5511999@c.us or xxx@lid
  linkedWaId: text("linked_wa_id"),
  phone: text("phone"),
  lid: text("lid"),
  name: text("name"),
  pushName: text("push_name"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  company: text("company"),
  notes: text("notes"),
  avatarUrl: text("avatar_url"),
  about: text("about"),
  isBusiness: boolean("is_business").notNull().default(false),
  isMyContact: boolean("is_my_contact").notNull().default(false),
  isWaContact: boolean("is_wa_contact").notNull().default(true),
  isBlocked: boolean("is_blocked").notNull().default(false),
  optedIn: boolean("opted_in").notNull().default(false),
  optedOut: boolean("opted_out").notNull().default(false),
  optOutAt: timestamp("opt_out_at", { withTimezone: true }),
  ownerUserId: text("owner_user_id"),
  source: text("source").notNull().default("whatsapp"), // whatsapp | manual | csv
  lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
  rawPayload: jsonb("raw_payload"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [
  uniqueIndex("contacts_session_wa_idx").on(t.sessionId, t.waId),
  index("contacts_phone_idx").on(t.phone),
  index("contacts_session_idx").on(t.sessionId),
]);

export const contactCustomFields = pgTable("contact_custom_fields", {
  id: id(),
  contactId: text("contact_id").notNull(),
  key: text("key").notNull(),
  value: text("value"),
}, (t) => [uniqueIndex("ccf_contact_key_idx").on(t.contactId, t.key)]);

export const customFieldDefinitions = pgTable("custom_field_definitions", {
  id: id(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  type: text("type").notNull().default("text"),
  createdAt: now("created_at"),
});

// ---------- Chats ----------
export const chats = pgTable("chats", {
  id: id(),
  sessionId: text("session_id").notNull(),
  waId: text("wa_id").notNull(),
  linkedWaId: text("linked_wa_id"),
  kind: text("kind").notNull().default("user"), // user|group|broadcast|newsletter|status|unknown
  name: text("name"),
  avatarUrl: text("avatar_url"),
  unreadCount: integer("unread_count").notNull().default(0),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  lastMessagePreview: text("last_message_preview"),
  lastMessageType: text("last_message_type"),
  lastMessageFromMe: boolean("last_message_from_me").default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  isPinned: boolean("is_pinned").notNull().default(false),
  isMuted: boolean("is_muted").notNull().default(false),
  isReadOnly: boolean("is_read_only").notNull().default(false),
  assignedUserId: text("assigned_user_id"),
  rawPayload: jsonb("raw_payload"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [
  uniqueIndex("chats_session_wa_idx").on(t.sessionId, t.waId),
  index("chats_session_last_idx").on(t.sessionId, t.lastMessageAt),
]);

// ---------- Messages ----------
export const messages = pgTable("messages", {
  id: id(),
  sessionId: text("session_id").notNull(),
  waMessageId: text("wa_message_id").notNull(),
  chatId: text("chat_id").notNull(), // wa chat id
  senderId: text("sender_id"),
  recipientId: text("recipient_id"),
  fromMe: boolean("from_me").notNull().default(false),
  type: text("type").notNull().default("chat"),
  body: text("body"),
  caption: text("caption"),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING|SENT|DELIVERED|READ|PLAYED|FAILED
  ack: integer("ack").default(0),
  quotedMessageId: text("quoted_message_id"),
  mentionedIds: jsonb("mentioned_ids").$type<string[]>(),
  isForwarded: boolean("is_forwarded").default(false),
  isStarred: boolean("is_starred").default(false),
  edited: boolean("edited").notNull().default(false),
  revoked: boolean("revoked").notNull().default(false),
  hasMedia: boolean("has_media").notNull().default(false),
  mediaMimeType: text("media_mime_type"),
  mediaFilename: text("media_filename"),
  mediaSize: integer("media_size"),
  location: jsonb("location").$type<{ lat: number; lng: number; name?: string }>(),
  vcard: text("vcard"),
  senderName: text("sender_name"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  rawPayload: jsonb("raw_payload"),
  createdAt: now("created_at"),
}, (t) => [
  uniqueIndex("messages_session_waid_idx").on(t.sessionId, t.waMessageId),
  index("messages_chat_ts_idx").on(t.sessionId, t.chatId, t.timestamp),
  index("messages_status_idx").on(t.status),
  index("messages_ts_idx").on(t.timestamp),
]);

export const messageMedia = pgTable("message_media", {
  id: id(),
  messageId: text("message_id").notNull(),
  sessionId: text("session_id").notNull(),
  chatId: text("chat_id").notNull(),
  mimeType: text("mime_type").notNull(),
  filename: text("filename"),
  size: integer("size"),
  storagePath: text("storage_path").notNull(),
  createdAt: now("created_at"),
}, (t) => [index("message_media_msg_idx").on(t.messageId)]);

export const messageReactions = pgTable("message_reactions", {
  id: id(),
  sessionId: text("session_id").notNull(),
  messageId: text("message_id").notNull(), // wa msg id
  senderId: text("sender_id").notNull(),
  emoji: text("emoji").notNull(),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
}, (t) => [uniqueIndex("reactions_msg_sender_idx").on(t.sessionId, t.messageId, t.senderId)]);

// ---------- Groups ----------
export const groups = pgTable("groups", {
  id: id(),
  sessionId: text("session_id").notNull(),
  waId: text("wa_id").notNull(),
  subject: text("subject"),
  description: text("description"),
  ownerId: text("owner_id"),
  avatarUrl: text("avatar_url"),
  participantCount: integer("participant_count").notNull().default(0),
  isAnnounce: boolean("is_announce").default(false),
  isRestricted: boolean("is_restricted").default(false),
  inviteLink: text("invite_link"),
  rawPayload: jsonb("raw_payload"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [uniqueIndex("groups_session_wa_idx").on(t.sessionId, t.waId)]);

export const groupMembers = pgTable("group_members", {
  id: id(),
  groupId: text("group_id").notNull(),
  sessionId: text("session_id").notNull(),
  waId: text("wa_id").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
}, (t) => [uniqueIndex("group_members_idx").on(t.groupId, t.waId)]);

// ---------- Labels ----------
export const labels = pgTable("labels", {
  id: id(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#22c55e"),
  createdAt: now("created_at"),
});

export const contactLabels = pgTable("contact_labels", {
  id: id(),
  contactId: text("contact_id").notNull(),
  labelId: text("label_id").notNull(),
}, (t) => [uniqueIndex("contact_labels_idx").on(t.contactId, t.labelId), index("contact_labels_label_idx").on(t.labelId)]);

// ---------- Templates ----------
export const templates = pgTable("templates", {
  id: id(),
  name: text("name").notNull(),
  category: text("category").notNull().default("MARKETING"),
  language: text("language").notNull().default("en"),
  header: text("header"),
  body: text("body").notNull(),
  footer: text("footer"),
  mediaPath: text("media_path"),
  mediaMimeType: text("media_mime_type"),
  mediaFilename: text("media_filename"),
  variables: jsonb("variables").$type<string[]>().default([]).notNull(),
  buttons: jsonb("buttons").$type<{ text: string; id?: string }[]>().default([]).notNull(),
  timesUsed: integer("times_used").notNull().default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
});

// ---------- Campaigns ----------
export const campaigns = pgTable("campaigns", {
  id: id(),
  name: text("name").notNull(),
  sessionId: text("session_id").notNull(),
  status: text("status").notNull().default("DRAFT"),
  messageType: text("message_type").notNull().default("text"), // text|template|image|video|audio|document|location|contact
  templateId: text("template_id"),
  body: text("body"),
  mediaPath: text("media_path"),
  mediaMimeType: text("media_mime_type"),
  mediaFilename: text("media_filename"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(), // location, vcard etc
  variables: jsonb("variables").$type<Record<string, string>>().default({}).notNull(),
  audience: jsonb("audience").$type<Record<string, unknown>>().default({}).notNull(),
  settings: jsonb("settings").$type<{ messagesPerMinute?: number; minDelayMs?: number; maxDelayMs?: number; retryCount?: number; retryDelayMs?: number; skipOptedOut?: boolean }>().default({}).notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  totalRecipients: integer("total_recipients").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  deliveredCount: integer("delivered_count").notNull().default(0),
  readCount: integer("read_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  lastError: text("last_error"),
  createdBy: text("created_by"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [index("campaigns_session_idx").on(t.sessionId), index("campaigns_status_idx").on(t.status)]);

export const campaignRecipients = pgTable("campaign_recipients", {
  id: id(),
  campaignId: text("campaign_id").notNull(),
  contactId: text("contact_id"),
  recipientWaId: text("recipient_wa_id").notNull(),
  displayName: text("display_name"),
  status: text("status").notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  waMessageId: text("wa_message_id"),
  renderedBody: text("rendered_body"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [
  uniqueIndex("campaign_recipient_unique").on(t.campaignId, t.recipientWaId),
  index("campaign_recipients_status_idx").on(t.campaignId, t.status),
  index("campaign_recipients_wamsg_idx").on(t.waMessageId),
]);

export const campaignJobs = pgTable("campaign_jobs", {
  id: id(),
  campaignId: text("campaign_id").notNull(),
  type: text("type").notNull().default("SEND"),
  status: text("status").notNull().default("QUEUED"), // QUEUED|RUNNING|DONE|FAILED|CANCELLED
  attempts: integer("attempts").notNull().default(0),
  runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: text("locked_by"),
  lastError: text("last_error"),
  createdAt: now("created_at"),
}, (t) => [index("campaign_jobs_status_idx").on(t.status, t.runAt)]);

export const messageDeliveries = pgTable("message_deliveries", {
  id: id(),
  sessionId: text("session_id").notNull(),
  waMessageId: text("wa_message_id").notNull(),
  campaignId: text("campaign_id"),
  recipientId: text("recipient_id"),
  chatId: text("chat_id").notNull(),
  status: text("status").notNull(),
  ack: integer("ack"),
  createdAt: now("created_at"),
}, (t) => [index("deliveries_wamsg_idx").on(t.waMessageId), index("deliveries_campaign_idx").on(t.campaignId)]);

// ---------- Webhooks ----------
export const webhooks = pgTable("webhooks", {
  id: id(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  secret: text("secret"),
  events: jsonb("events").$type<string[]>().default([]).notNull(),
  sessionIds: jsonb("session_ids").$type<string[]>().default([]).notNull(),
  headers: jsonb("headers").$type<Record<string, string>>().default({}).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  retryCount: integer("retry_count").notNull().default(3),
  timeoutMs: integer("timeout_ms").notNull().default(10000),
  createdAt: now("created_at"),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: id(),
  webhookId: text("webhook_id").notNull(),
  event: text("event").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING|SUCCESS|FAILED
  attempts: integer("attempts").notNull().default(0),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  error: text("error"),
  durationMs: integer("duration_ms"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [index("wh_deliveries_webhook_idx").on(t.webhookId, t.createdAt), index("wh_deliveries_status_idx").on(t.status, t.nextAttemptAt)]);

// ---------- Automation ----------
export const automationRules = pgTable("automation_rules", {
  id: id(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  sessionId: text("session_id"), // null = all sessions
  trigger: text("trigger").notNull().default("message.received"),
  conditions: jsonb("conditions").$type<{ type: string; value?: string; labelId?: string; start?: string; end?: string; days?: number[] }[]>().default([]).notNull(),
  actions: jsonb("actions").$type<{ type: string; text?: string; templateId?: string; labelId?: string; userId?: string }[]>().default([]).notNull(),
  cooldownSeconds: integer("cooldown_seconds").notNull().default(60),
  timesTriggered: integer("times_triggered").notNull().default(0),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  createdAt: now("created_at"),
});

// ---------- Logs / settings ----------
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  userName: text("user_name"),
  action: text("action").notNull(),
  resource: text("resource"),
  resourceId: text("resource_id"),
  sessionId: text("session_id"),
  ip: text("ip"),
  metadata: jsonb("metadata"),
  createdAt: now("created_at"),
}, (t) => [index("audit_created_idx").on(t.createdAt)]);

export const systemLogs = pgTable("system_logs", {
  id: serial("id").primaryKey(),
  level: text("level").notNull(),
  source: text("source").notNull(),
  sessionId: text("session_id"),
  message: text("message").notNull(),
  stack: text("stack"),
  metadata: jsonb("metadata"),
  createdAt: now("created_at"),
}, (t) => [index("syslog_created_idx").on(t.createdAt), index("syslog_level_idx").on(t.level)]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: now("updated_at"),
});

export const capabilityTests = pgTable("capability_tests", {
  method: text("method").primaryKey(),
  status: text("status").notNull(), // SUPPORTED|ERROR
  lastTestedAt: now("last_tested_at"),
  durationMs: integer("duration_ms"),
  error: text("error"),
});

export const eventLog = pgTable("event_log", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(),
  sessionId: text("session_id"),
  payload: jsonb("payload"),
  createdAt: now("created_at"),
}, (t) => [index("event_log_created_idx").on(t.createdAt)]);
