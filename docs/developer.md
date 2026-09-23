# Developer tools
Developer page: API keys, API explorer (raw HTTP against `/api/v1`), event monitor (live SSE), queue monitor (campaign jobs, pending webhook deliveries), routes, database inspector, JSON backup. Capabilities page: registry + audit + per-method test (`POST /developer/capabilities/invoke` – whitelisted methods only, `dangerous` ones require ADMIN; no arbitrary code execution).

## Manual acceptance checklist (requires a phone + Chromium)
1. Sessions → New session → QR appears within ~20 s → scan → status READY, phone/profile shown, sync stats in Logs.
2. Inbox lists chats; open one; scroll up loads older pages; send text/image/document/voice; ticks progress SENT→DELIVERED→READ; reply/react/edit/delete/forward/star.
3. Send a message from the phone → appears instantly (SSE) and increments unread; typing indicator shows.
4. Contacts synced; open profile; label a contact; CSV import.
5. Templates → create with `{{first_name}}` → preview renders.
6. Campaigns → wizard → audience by label → validation passes → send → progress bar live → recipients table shows SENT/DELIVERED/READ; pause/resume/cancel/retry.
7. Webhooks → create (public URL, e.g. webhook.site) → Test → SUCCESS with signature header; send a message → `message.received` delivered.
8. Developer → Capabilities → run `getConnectionState`, `listChats`, `getMessages` → SUPPORTED with raw output.
