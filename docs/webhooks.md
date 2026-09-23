# Webhooks
Events: message.received, message.sent, message.delivered, message.read, message.failed, message.edited, message.deleted, reaction.received, session.status, contact.updated, group.updated, campaign.status.
Payload: `{ event, timestamp, sessionId, chatId, contact, message, metadata }`.
Headers: `x-webhook-event`, `x-webhook-timestamp`, `x-webhook-delivery`, custom headers, and `x-webhook-signature: sha256=<HMAC_SHA256(secret, timestamp + "." + body)>`.
Verification (Node): `crypto.createHmac('sha256', secret).update(ts + '.' + rawBody).digest('hex')`.
Retries: exponential backoff (5s·2^n, max 5 min) up to `retryCount`; deliveries stored in `webhook_deliveries` with response status/body; manual retry and test delivery available. SSRF: private/loopback/link-local targets are rejected unless `WEBHOOK_ALLOW_PRIVATE=true`.
