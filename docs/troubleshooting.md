# Troubleshooting
* **Session ERROR "Chromium/Chrome not available"** – install Chrome/Chromium and set `PUPPETEER_EXECUTABLE_PATH`, or reinstall without `PUPPETEER_SKIP_DOWNLOAD`. In Docker the image ships `chromium`.
* **QR never appears** – check Sessions → Diagnostics and Logs (source WPPConnect). Increase `shm_size`; ensure outbound HTTPS to web.whatsapp.com.
* **DISCONNECTED / CONFLICT** – WhatsApp Web opened elsewhere; use *Use WhatsApp here* or restart.
* **SESSION_NOT_READY (409)** – wait for READY; campaigns auto-pause and can be resumed.
* **Media unavailable (410)** – media expired on WhatsApp servers; ask the contact to resend.
* **Webhook SSRF_BLOCKED** – target is private; set `WEBHOOK_ALLOW_PRIVATE=true` for local testing.
* **Login cookie not set behind http proxy** – set `COOKIE_SECURE=false`.
* **Reset a session's WhatsApp link** – Logout (removes `data/wppconnect/<slug>`), then Start.
