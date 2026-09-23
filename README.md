# WhatsApp CRM (self-hosted, powered by WPPConnect)

A production-oriented, self-hosted WhatsApp CRM / messaging platform: multi-session device manager with QR login, a WhatsApp-Web-like realtime inbox, CRM contacts & labels, application templates with a variable engine, a persistent campaign engine with throttling and per-recipient tracking, webhooks, an automation rule engine, a developer REST API with OpenAPI docs, and a **WPPConnect Capability Registry** that audits the installed WPPConnect version against the application.

> ⚠️ **Unofficial integration.** This project automates WhatsApp Web through [`@wppconnect-team/wppconnect`](https://github.com/wppconnect-team/wppconnect). It is **not** the Meta WhatsApp Business Cloud API, not a Meta BSP, and templates here are **application templates**, not Meta-approved templates. Using WhatsApp automation may violate WhatsApp's Terms of Service and can lead to account bans. Use responsibly, obtain consent, respect opt-outs.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Lucide icons, dark/light mode |
| Backend | Next.js route handlers + a service layer (`src/server`) in the same app, Node.js 22 |
| WhatsApp engine | `@wppconnect-team/wppconnect` **2.3.3** (puppeteer 24) – the only engine |
| Database | [Supabase](https://supabase.com) (PostgreSQL) via Drizzle ORM |
| Realtime | Server-Sent Events (`/api/events`) fed by an internal event bus |
| Queue | Database-backed campaign job queue (no Redis required; BullMQ can be slotted in behind `campaign.service.ts`) |
| Storage | Local filesystem behind a `MediaStorage` interface (S3/MinIO-ready) |
| Deployment | Docker + docker-compose (app container only; DB is hosted on Supabase) |

### Database note
All persistence is isolated in `src/db/schema.ts` (24 tables) and the repositories/services. Drizzle ORM connects to Supabase's managed PostgreSQL via the session-mode pooler. The schema uses only portable column types (text/int/bool/timestamp/jsonb). Every WhatsApp-related table carries `session_id` and has the critical indexes (session, chat+timestamp, phone, campaign+status, message status).

## Features

- **Sessions**: create/start/stop/restart/logout/delete, QR display & refresh, status (STOPPED→STARTING→QR→AUTHENTICATING→CONNECTED→READY / DISCONNECTED / ERROR), phone, profile name/picture, platform, WA version, battery, heartbeat, reconnect attempts, per-session logs, diagnostics, screenshot, "use here" for conflicts, auto-restore on boot, one client per session guaranteed by `SessionManager`.
- **Inbox**: 3-column WhatsApp-Web-like UI; filters (all/unread/contacts/groups/pinned/archived/label), search, unread counters, pinned/muted/archived indicators, labels; conversation with date separators, unread divider, grouping, quoted messages & jump-to-message, reactions, edited/deleted states, ticks (sent/delivered/read), media previews (image/video/audio/document/sticker/location/vcard/poll), infinite scroll with WhatsApp cursor pagination (`getMessages` + `direction:'before'`), "N new messages" pill when scrolled up, typing/presence, in-chat search.
- **Message actions**: reply, forward, react, edit (own text ≤15 min), delete for everyone / for me, star, copy, download, mark played, poll votes.
- **Composer**: text, emoji, drag-and-drop/attach image/video/audio/document, sticker, voice note recording (PTT), location, contact card, template picker with variables, poll, list message (API), reply preview, typing state, upload progress, failed-send errors.
- **Contacts (CRM)**: table with avatar/name/phone/WA id/type/labels/company/last interaction/status; search & filters; CSV import with validation preview (valid/invalid/duplicate/exists, skip or update); CSV export; add/edit/delete local contact; notes; custom fields (arbitrary keys usable as `{{variables}}`); owner assignment; opt-in/opt-out; block/unblock; WhatsApp number validity check; live about/picture/presence; common groups; campaign history & message stats. CRM data (SQL) is kept separate from WhatsApp data (`@c.us`, `@lid`, `@g.us`, `@newsletter`, `status@broadcast` handled by `normalizeWhatsAppId`).
- **Groups**: list, details, members/admins, create, join by link, subject/description, add/remove/promote/demote, invite link get/revoke, permissions (announce/restrict), icon, membership requests approve/reject, leave.
- **Labels**: CRM labels (color, rename, delete, assign, bulk assign, filter) and native WhatsApp Business labels (list/create/delete/assign) shown separately.
- **Templates**: category/language/header/body/footer/media/buttons; `{{first_name}}`-style variables; live WhatsApp preview; syntax validation; missing-variable detection; usage stats; duplicate/search/filter.
- **Campaigns**: 8-step wizard (name → session → audience → type → compose → preview → validation → send/schedule). Audience from contacts (checkbox/select filtered), labels (include/exclude), groups, or all – never typed phone numbers. Persistent queue with DB job claiming, recipient state machine `PENDING→QUEUED→SENDING→SENT→DELIVERED→READ` / `FAILED→QUEUED` (retry) / `SKIPPED` / `CANCELLED`, unique `(campaignId, recipientWaId)`, throttling (msgs/min, min/max jitter), retries, pause/resume/cancel, retry failed (all or individual), realtime progress, analytics, opt-out skipping, size limits, confirmation step, audit trail.
- **Automation**: rule engine (`contains/equals/starts_with/regex/has_label/business hours` → `send_text/send_template/add_label/remove_label/assign_user/opt_out`) with cooldowns, plus STOP/START opt-out keyword handling. Built on the internal event bus so a visual builder can be added later.
- **Webhooks**: CRUD, enable/disable, event & session filtering, custom headers, HMAC-SHA256 signature (`x-webhook-signature: sha256=HMAC(secret, "<ts>.<body>")`), timeout, retries with backoff, delivery log with response bodies, manual retry, test delivery, SSRF protection.
- **Catalog / Business profile / Status / Channels**: implemented against the real WPPConnect 2.3.3 layers (see limitations).
- **Developer platform**: API keys (hashed, shown once, roles, session restrictions, expiry, revoke), REST API `/api/v1`, OpenAPI at `/api/docs`, API explorer, event monitor, queue monitor, database inspector, routes list, **WPPConnect Capabilities** page with per-method metadata, runtime audit and one-click test.
- **Operations**: dashboard metrics & charts, analytics, structured system logs (with filters), audit logs, health page, settings (general/session/messaging/campaign/template/automation/webhook/storage/security/logs), users & roles (ADMIN/OPERATOR/VIEWER), JSON backup/restore.

## Prerequisites

- **Node.js 22+** (tested on v22.22)
- **Supabase project** (free tier works) — create one at [supabase.com](https://supabase.com)
- **Chromium/Chrome** for WPPConnect (puppeteer). Either let puppeteer download Chromium (`npm install` without `PUPPETEER_SKIP_DOWNLOAD`) or install system Chromium and set `PUPPETEER_EXECUTABLE_PATH`. Linux needs the usual Chromium shared libraries (`libnss3 libatk-bridge2.0-0 libgbm1 libasound2 …`) – the Dockerfile installs Debian's `chromium` package.
- ~1 GB RAM per concurrently connected WhatsApp session (headless Chromium).

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. In **SQL Editor**, paste and run `supabase/migrations/20240101000000_init.sql` to create all tables and indexes
3. From **Project Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
   - **service_role** secret key → `SUPABASE_SERVICE_ROLE_KEY`
4. From **Project Settings → Database → Connection Pooling** (Session mode, port 5432), copy the connection string → `SUPABASE_DB_URL`

## Installation (development)

```bash
git clone <repo> && cd <repo>
cp .env.example .env            # fill in SUPABASE_DB_URL and other SUPABASE_* vars
npm install                      # downloads Chromium unless PUPPETEER_SKIP_DOWNLOAD=1
npm run dev                      # http://localhost:3000
```

> Schema is applied directly in Supabase (step 2 above). The `db:push` / `db:migrate` scripts still work for local dev if you set `SUPABASE_DB_URL` in your shell.

Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults `admin@example.com` / `admin12345`) and change the password in **Settings → My account**.

Production: `npm run build && npm run start`.

## Docker

```bash
cp .env.example .env   # fill in all SUPABASE_* vars
docker compose up -d --build
```

Volumes: `appdata` only (`/app/data` → `wppconnect/` auth tokens + `media/`). The database is hosted on Supabase — no local Postgres container. `shm_size: 1gb` is required for Chromium.

- **Backup**: Application-level JSON export via `GET /api/v1/admin/backup` (ADMIN) or Developer → Database. For a full SQL dump use the Supabase Dashboard → Database → Backups.
- **Restore**: `POST /api/v1/admin/restore` with `{ "confirm": "RESTORE", "tables": {...} }` (insert-only; existing rows are skipped).
- **Database reset**: Drop and recreate tables via the Supabase SQL Editor, then re-run the migration SQL.
- **WPP session reset**: use *Logout* in the UI (deletes the token folder) or remove `data/wppconnect/<slug>` while the session is stopped.

## Sessions & QR login

1. **Sessions → New session** → a headless Chromium starts, `wppconnect.create()` is called with `catchQR`/`statusFind` callbacks.
2. The QR (base64) is stored and pushed over SSE (`session.qr`); the dialog refreshes automatically and shows attempts/expiry. **Refresh QR** restarts a stopped/failed session.
3. On `CONNECTED`, host device info is read (`getHostDevice`, `getWid`, `getWAVersion`, `getProfilePicFromServer`), status becomes `READY`, and a background sync runs (`getAllContacts`, `listChats`, `getMessages` for the 30 most recent chats).
4. Listener layer is wired (`onAnyMessage`, `onAck`, `onStateChange`, `onStreamChange`, `onMessageEdit`, `onRevokedMessage`, `onReactionMessage`, `onPresenceChanged`, `onParticipantsChanged`, `onAddedToGroup`, `onNewChat`, `onIncomingCall`, `onPollResponse`, `onUpdateLabel`, `onInterfaceChange`).
5. A 30-second heartbeat (`isConnected`, `getBatteryLevel`) detects drops; `browserClose`/`serverClose` trigger bounded reconnects.

One session failing never blocks the app: WPPConnect is imported lazily inside `SessionManager.start`.

## Campaigns, templates, webhooks, API

See `docs/campaigns.md`, `docs/templates.md`, `docs/webhooks.md`, `docs/api.md`. Quick API example:

```bash
curl -H "x-api-key: wacrm_..." "http://localhost:3000/api/v1/chats?sessionId=<id>"
curl -H "x-api-key: wacrm_..." -H "content-type: application/json" -X POST \
  -d '{"type":"text","chatId":"5511999999999@c.us","text":"Hello"}' \
  "http://localhost:3000/api/v1/messages?sessionId=<id>"
```

Responses: `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code": "SESSION_NOT_READY", "message": "..." } }`.

## Security

HTTP-only cookie sessions (bcrypt passwords), API keys stored as SHA-256 hashes and shown once, RBAC (ADMIN > OPERATOR > VIEWER) enforced per route, per-session API key restrictions, same-origin check for cookie-authenticated mutations, in-memory rate limiting, Zod validation on every input, MIME/size validation on uploads, path-traversal-safe storage keys, SSRF protection for webhook URLs, webhook HMAC signatures, no raw stack traces to users, WPPConnect token folder never served.

## Known limitations

- **WhatsApp ToS**: unofficial automation; bans are possible. Keep campaign rates conservative.
- **Delivery/read analytics** depend on ACK events reaching the session; the UI says so.
- **Media** downloaded through `downloadMedia` may expire on WhatsApp servers; the UI shows "Media unavailable".
- **Status viewers**, **posting to channels**, **channel listing API** are not exposed by WPPConnect 2.3.3 → channels are derived from `listChats` (`@newsletter`), status feed from `status@broadcast`.
- **Buttons/interactive messages**: template buttons are stored but WPPConnect 2.3.3 sends text/media/list/poll; buttons are not rendered by WhatsApp for unofficial clients.
- `getBatteryLevel`, some `getChatIsOnline`/`getLastSeen` calls return errors on multi-device accounts / privacy settings – handled gracefully.
- Battery/`@lid` migration: contacts may appear with `@lid` ids; they are normalized but not always resolvable to a phone (`getPnLidEntry` is exposed in the explorer).
- Single-process worker (campaign & webhook dispatchers run inside the Next.js server). Scale-out requires an external queue (BullMQ) – the service boundaries are prepared.

## Project structure

```
src/
  app/(app)/…            pages: dashboard, inbox, contacts, groups, campaigns, templates, labels, automation,
                         catalog, status, channels, sessions, webhooks, developer(+capabilities), logs, analytics, health, settings
  app/api/v1/[[...path]] single entry for the REST API (router in src/server/api)
  app/api/events         SSE stream · app/api/auth/* · app/api/docs (Swagger UI)
  components/            ui primitives, app shell, charts
  lib/                   api helpers, auth, events (bus), ids, logger, storage, template engine, client hooks
  server/
    wpp/                 session-manager, event-bridge, normalize, capability-registry
    services/            whatsapp (Session/Chat/Message/Media/Contact/Group/Profile/Catalog/Status/Channel/Presence/Label services),
                         message.repo, sync, campaign (queue), webhook, automation, settings
    api/                 router, routes, openapi
  db/schema.ts           Drizzle schema (28 tables)
tests/                   vitest unit tests (template, ids, normalization, campaign state machine, permissions, capability audit)
docs/                    architecture, installation, wppconnect, sessions, inbox, contacts, groups, campaigns, templates, webhooks, api, developer, troubleshooting, capability-matrix
```

## Migrations

The canonical schema lives in `supabase/migrations/20240101000000_init.sql` — run it in the Supabase SQL Editor to provision a fresh project.

For local development with a direct Supabase Postgres connection:
- `npm run db:generate` — generate a new migration file after editing `src/db/schema.ts`
- `npm run db:migrate` — apply pending migrations (requires `SUPABASE_DB_URL` set)
- `npm run db:push` — quick sync for dev (skips migration files)

The Docker entrypoint runs `drizzle-kit migrate` on container boot (using `SUPABASE_DB_URL`) and falls back to `push` if no migration files exist.

## Tests

`npm test` – 35 tests:
* **Unit** (`tests/*.test.ts`): template renderer, ID normalization, message/chat normalization, campaign state machine, RBAC/session restrictions/API keys, capability audit against the installed WPPConnect package.
* **Integration** (`tests/integration/api.test.ts`, needs `SUPABASE_DB_URL`): real router + real database – API-key auth & RBAC, session creation/status/QR, session-restricted keys, honest `SESSION_NOT_READY` on WhatsApp-bound endpoints, template CRUD/render, CSV import validation, audience resolution (labels/exclusions/opt-out), campaign creation & state guards, message persistence idempotency & ack ordering, webhook CRUD with SSRF guard, capability registry/OpenAPI/whitelist enforcement.
* E2E (browser + real WhatsApp QR scan) is intentionally manual – see `docs/troubleshooting.md` and the acceptance checklist in `docs/developer.md`.
