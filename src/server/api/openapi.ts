import { listRoutes } from "./router";

/** Generates an OpenAPI 3.0 document from registered routes. */
export function openApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of listRoutes()) {
    if (!r.doc) continue;
    const p = "/api/v1" + r.path.replace(/:(\w+)/g, "{$1}");
    const params = [...r.path.matchAll(/:(\w+)/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    for (const [k, v] of Object.entries(r.doc.query ?? {})) params.push({ name: k, in: "query", required: v === "required", schema: { type: "string" }, description: v } as never);
    paths[p] ??= {};
    paths[p][r.method.toLowerCase()] = {
      summary: r.doc.summary, tags: [r.doc.tag], "x-required-role": r.role, parameters: params,
      requestBody: r.doc.body ? { content: { "application/json": { example: r.doc.body } } } : undefined,
      responses: { 200: { description: "Success", content: { "application/json": { example: { success: true, data: r.doc.example ?? {} } } } }, 401: { description: "Unauthorized", content: { "application/json": { example: { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } } } } }, 409: { description: "Session not ready", content: { "application/json": { example: { success: false, error: { code: "SESSION_NOT_READY", message: "WhatsApp session is not ready" } } } } } },
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }, { CookieAuth: [] }],
    };
  }
  return {
    openapi: "3.0.3",
    info: { title: `${process.env.NEXT_PUBLIC_APP_NAME || "WhatsApp CRM"} API`, version: "1.0.0", description: "Self-hosted WhatsApp CRM powered by WPPConnect (unofficial WhatsApp Web automation, not the Meta Cloud API). Most endpoints require `sessionId` query param. Roles: ADMIN > OPERATOR > VIEWER. API keys may be restricted to specific sessions." },
    servers: [{ url: "/" }],
    components: { securitySchemes: { ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" }, BearerAuth: { type: "http", scheme: "bearer" }, CookieAuth: { type: "apiKey", in: "cookie", name: "wacrm_session" } } },
    tags: ["System", "Sessions", "Chats", "Messages", "Contacts", "Groups", "Labels", "Templates", "Campaigns", "Webhooks", "Automation", "Profile", "Catalog", "Status", "Channels", "Developer", "Auth", "Settings", "Logs", "Media", "Admin"].map((n) => ({ name: n })),
    paths,
    "x-realtime": { endpoint: "/api/events (Server-Sent Events)", events: ["message.received", "message.sent", "message.delivered", "message.read", "message.failed", "message.edited", "message.deleted", "reaction.received", "presence.changed", "typing", "chat.updated", "contact.updated", "group.updated", "session.status", "session.qr", "campaign.status", "campaign.progress", "webhook.delivered"] },
  };
}
