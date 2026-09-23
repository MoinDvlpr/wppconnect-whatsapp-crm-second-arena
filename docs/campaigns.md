# Campaigns

**Statuses**: DRAFT → VALIDATING → QUEUED → RUNNING → COMPLETED | PARTIAL | FAILED; RUNNING/QUEUED ⇄ PAUSED; any non-terminal → CANCELLED; PARTIAL/FAILED → QUEUED (retry).
**Recipient statuses**: PENDING → QUEUED → SENDING → SENT → DELIVERED → READ; SENDING → FAILED → QUEUED (retry, `nextAttemptAt`); SKIPPED (opted out); CANCELLED.

**Idempotency**: `campaign_recipients` has `unique(campaign_id, recipient_wa_id)`; a recipient is claimed with `UPDATE … SET status='SENDING' WHERE id=? AND status='QUEUED'` so API/front-end retries can never double-send.

**Audience**: `resolveAudience(sessionId, {contactIds, labelIds, excludeLabelIds, groupIds, waIds, all})` – previewed before send (`POST /campaigns/audience/preview`) with opted-out count.

**Safety**: messages/minute, min/max random delay, max campaign size, retry count/delay (defaults in Settings → Campaign, overridable per campaign), automatic skipping of opted-out contacts, session-readiness checks (campaign auto-pauses if the session drops), explicit confirmation checkbox, audit log entries for create/start/pause/resume/cancel.

**Rendering**: `renderTemplate(body, {contact: contactToVariables(contact)+customFields, campaign: variables})`; missing variables fail the recipient (never sends `{{x}}`).

**Tracking**: `message_deliveries` rows on SENT and on each ACK; `campaign.progress` SSE events drive the live progress bar; analytics endpoint computes status breakdown, timeline per minute, replies after start and duration.
