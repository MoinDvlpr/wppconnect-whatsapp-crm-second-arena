import { EventEmitter } from "node:events";

/** Internal application event bus. WPPConnect -> EventBus -> (DB, SSE, webhooks, automation). */
export type AppEventName =
  | "message.received" | "message.sent" | "message.delivered" | "message.read" | "message.failed" | "message.edited" | "message.deleted"
  | "reaction.received" | "contact.updated" | "group.updated" | "session.status" | "session.qr" | "campaign.status" | "campaign.progress"
  | "chat.updated" | "presence.changed" | "typing" | "webhook.delivered" | "webhook.received" | "system.log";

export interface AppEvent<T = unknown> { event: AppEventName; timestamp: string; sessionId?: string | null; chatId?: string | null; data: T; }

class EventBus extends EventEmitter {
  publish<T>(event: AppEventName, data: T, ctx: { sessionId?: string | null; chatId?: string | null } = {}) {
    const payload: AppEvent<T> = { event, timestamp: new Date().toISOString(), sessionId: ctx.sessionId ?? null, chatId: ctx.chatId ?? null, data };
    this.emit(event, payload);
    this.emit("*", payload);
    return payload;
  }
  subscribeAll(fn: (e: AppEvent) => void) { this.on("*", fn); return () => this.off("*", fn); }
}
const g = globalThis as typeof globalThis & { __waCrmBus?: EventBus };
export const eventBus = g.__waCrmBus ?? (g.__waCrmBus = (() => { const b = new EventBus(); b.setMaxListeners(200); return b; })());
