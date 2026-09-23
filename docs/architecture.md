# Architecture

```
React (App Router pages)  ──fetch──▶  /api/v1 router (auth, RBAC, zod, rate limit)
        ▲ SSE /api/events                     │
        │                                     ▼
   EventBus  ◀── event-bridge ◀── WPPConnect listeners      domain services (src/server/services)
        │                                                     │  MessageService / ChatService / …
        ├──▶ message.repo / DB upsert                         ▼
        ├──▶ webhook.service (dispatcher, retries)     SessionManager.requireClient(sessionId)
        ├──▶ automation.service (rules)                       │
        └──▶ event_log (monitor)                              ▼
                                                     @wppconnect-team/wppconnect client
```

* **SessionManager** (`src/server/wpp/session-manager.ts`): `Map<sessionId, Runtime>` singleton on `globalThis` (survives HMR). One client per session, QR handling, statusFind mapping, heartbeat, bounded reconnect, restore on boot.
* **Event bridge**: normalizes WPPConnect payloads (`normalizeMessage/Chat/Contact/Group`) → idempotent DB upsert (`unique(session_id, wa_message_id)`) → `eventBus.publish`.
* **Internal vs external events**: the EventBus is internal; `webhook.service` subscribes to it and persists deliveries, so third-party HTTP never blocks the WhatsApp client.
* **Campaign engine** (`campaign.service.ts`): DB-backed `campaign_jobs` claimed by a worker tick; recipients claimed with `UPDATE … WHERE status='QUEUED'` (idempotent), throttled loop, pause/cancel observed between sends, ACK events promote recipient status.
* **Normalization**: raw WPPConnect objects are never exposed; `rawPayload` is only stored when `KEEP_RAW_PAYLOAD=true`.
* **Storage**: `MediaStorage` interface (local FS implementation) – swap for S3/MinIO.
* **Capability registry**: curated metadata from the installed `.d.ts` files + runtime prototype introspection; `runCapabilityAudit()` runs at boot and logs mapped/deprecated/unsupported/unmapped counts.
