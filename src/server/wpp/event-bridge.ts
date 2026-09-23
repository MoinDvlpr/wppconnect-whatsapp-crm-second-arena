import type { Message, Whatsapp } from "@wppconnect-team/wppconnect";
import { eventBus } from "@/lib/events";
import { logger } from "@/lib/logger";
import { normalizeMessage, ackToStatus } from "./normalize";
import { messageRepo } from "../services/message.repo";
import { normalizeWhatsAppId } from "@/lib/ids";

/**
 * Wires WPPConnect listener-layer events into the app:
 * WhatsApp -> WPPConnect listener -> normalize -> DB upsert -> EventBus (-> SSE, webhooks, automation).
 */
export function attachListeners(sessionId: string, client: Whatsapp, hooks: { onState: (state: string) => void }): () => void {
  const disposers: { dispose: () => void }[] = [];
  const on = <T>(fn: (cb: (d: T) => void) => { dispose: () => void }, cb: (d: T) => void) => {
    try { disposers.push(fn.call(client, cb)); } catch (e) { logger.warn("WPPConnect", "listener attach failed: " + (e as Error).message, {}, sessionId); }
  };

  on<Message>(client.onAnyMessage, async (raw) => {
    try {
      const n = normalizeMessage(raw, sessionId, process.env.KEEP_RAW_PAYLOAD === "true");
      if (!n) return;
      const { inserted, message } = await messageRepo.upsertIncoming(n, raw);
      if (!inserted) return;
      const ev = n.fromMe ? "message.sent" : "message.received";
      eventBus.publish(ev, message, { sessionId, chatId: n.chatId });
    } catch (e) { logger.error("WPPConnect", "onAnyMessage handler failed", e, {}, sessionId); }
  });

  on<{ id: { _serialized?: string } | string; ack: number; from: string; to: string }>(client.onAck as never, async (ack) => {
    try {
      const id = typeof ack.id === "string" ? ack.id : ack.id?._serialized;
      if (!id) return;
      const status = ackToStatus(Number(ack.ack), true);
      const updated = await messageRepo.updateStatus(sessionId, id, status, Number(ack.ack));
      if (!updated) return;
      const ev = status === "READ" || status === "PLAYED" ? "message.read" : status === "DELIVERED" ? "message.delivered" : status === "FAILED" ? "message.failed" : "message.sent";
      eventBus.publish(ev, { waMessageId: id, status, ack: ack.ack, chatId: updated.chatId }, { sessionId, chatId: updated.chatId });
      const { campaignService } = await import("../services/campaign.service");
      campaignService.onAck(sessionId, id, status).catch(() => { });
    } catch (e) { logger.error("WPPConnect", "onAck handler failed", e, {}, sessionId); }
  });

  on<string>(client.onStateChange as never, (state) => hooks.onState(String(state)));
  on<string>(client.onStreamChange as never, (state) => { logger.info("WPPConnect", `stream: ${state}`, {}, sessionId); if (String(state) === "DISCONNECTED") hooks.onState("TIMEOUT"); if (String(state) === "CONNECTED") hooks.onState("CONNECTED"); });
  on<{ mode?: string; displayInfo?: string }>(client.onInterfaceChange as never, (s) => logger.debug("WPPConnect", `interface: ${s.mode}/${s.displayInfo}`, {}, sessionId));

  on<{ chat: { _serialized?: string } | string; id: { _serialized?: string } | string; msg: Message; newText: string }>(client.onMessageEdit as never, async (d) => {
    try {
      const id = typeof d.id === "string" ? d.id : d.id?._serialized; if (!id) return;
      const chatId = normalizeWhatsAppId(d.chat)?.id ?? null;
      await messageRepo.markEdited(sessionId, id, d.newText);
      eventBus.publish("message.edited", { waMessageId: id, body: d.newText, chatId }, { sessionId, chatId });
    } catch (e) { logger.error("WPPConnect", "onMessageEdit failed", e, {}, sessionId); }
  });

  on<{ id: string | { _serialized?: string }; refId?: string; chatId?: unknown; from?: string; to?: string }>(client.onRevokedMessage as never, async (d) => {
    try {
      const target = d.refId ?? (typeof d.id === "string" ? d.id : d.id?._serialized);
      if (!target) return;
      const chatId = normalizeWhatsAppId(d.chatId ?? d.from)?.id ?? null;
      const rows = await messageRepo.markRevokedByStanza(sessionId, target, chatId);
      eventBus.publish("message.deleted", { waMessageId: target, chatId, affected: rows }, { sessionId, chatId });
    } catch (e) { logger.error("WPPConnect", "onRevokedMessage failed", e, {}, sessionId); }
  });

  on<{ id: string | { _serialized?: string }; msgId: { _serialized?: string } | string; reactionText: string; sender: unknown; timestamp: number; read?: boolean }>(client.onReactionMessage as never, async (d) => {
    try {
      const msgId = typeof d.msgId === "string" ? d.msgId : d.msgId?._serialized; if (!msgId) return;
      const sender = normalizeWhatsAppId(d.sender)?.id ?? "unknown";
      await messageRepo.upsertReaction(sessionId, msgId, sender, d.reactionText, Number(d.timestamp ?? Date.now()));
      const msg = await messageRepo.findByWaId(sessionId, msgId);
      eventBus.publish("reaction.received", { waMessageId: msgId, senderId: sender, emoji: d.reactionText, chatId: msg?.chatId ?? null }, { sessionId, chatId: msg?.chatId ?? null });
    } catch (e) { logger.error("WPPConnect", "onReactionMessage failed", e, {}, sessionId); }
  });

  on<{ id: unknown; isOnline?: boolean; isGroup?: boolean; state?: string; t?: number; participants?: { id: unknown; state?: string }[] }>(client.onPresenceChanged as never, (d) => {
    const chatId = normalizeWhatsAppId(d.id)?.id; if (!chatId) return;
    const state = d.state ?? d.participants?.[0]?.state;
    eventBus.publish(state === "typing" || state === "recording" ? "typing" : "presence.changed", { chatId, isOnline: d.isOnline, state, t: d.t }, { sessionId, chatId });
  });

  on<{ by?: string; byPushName?: string; groupId: string; action: string; operation?: string; who: string[] | string }>(client.onParticipantsChanged as never, async (d) => {
    const chatId = normalizeWhatsAppId(d.groupId)?.id ?? null;
    eventBus.publish("group.updated", { groupId: chatId, action: d.action ?? d.operation, who: d.who, by: d.by }, { sessionId, chatId });
    try { const { syncGroup } = await import("../services/sync.service"); if (chatId) await syncGroup(sessionId, chatId); } catch { /* ignore */ }
  });
  on<{ id: unknown }>(client.onAddedToGroup as never, async (chat) => {
    const chatId = normalizeWhatsAppId(chat.id)?.id ?? null;
    eventBus.publish("group.updated", { groupId: chatId, action: "added" }, { sessionId, chatId });
    try { const { syncGroup } = await import("../services/sync.service"); if (chatId) await syncGroup(sessionId, chatId); } catch { /* ignore */ }
  });
  on<{ id: unknown }>(client.onNewChat as never, async (chat) => {
    const chatId = normalizeWhatsAppId(chat.id)?.id ?? null;
    eventBus.publish("chat.updated", { chatId, action: "new" }, { sessionId, chatId });
  });
  on<{ id: string; peerJid: string; isGroup?: boolean }>(client.onIncomingCall as never, (call) => {
    logger.info("WPPConnect", "incoming call", { from: call.peerJid }, sessionId);
    eventBus.publish("system.log", { type: "incoming_call", from: call.peerJid, callId: call.id }, { sessionId, chatId: normalizeWhatsAppId(call.peerJid)?.id ?? null });
  });
  on<{ msgId: unknown; chatId: unknown; selectedOptions: unknown; sender: unknown; timestamp?: unknown }>(client.onPollResponse as never, async (d) => {
    try {
      const chatId = normalizeWhatsAppId(d.chatId)?.id ?? null;
      // msgId comes through Puppeteer exposeFunction as a plain string (_serialized) or a MsgKey object
      const msgId = typeof d.msgId === "string" ? d.msgId : (d.msgId as { _serialized?: string })?._serialized;
      if (!msgId || !chatId) return;
      const sender = normalizeWhatsAppId(d.sender)?.id ?? "unknown";

      logger.debug("WPPConnect", "onPollResponse raw", { msgId, sender, selectedOptions: JSON.stringify(d.selectedOptions) }, sessionId);

      // Fetch the stored poll so we can resolve numeric indexes to option names.
      // wa-js chat.poll_response always delivers selectedOptions as number[] (0-based index).
      const pollMsg = await messageRepo.findByWaId(sessionId, msgId);
      const storedOptions = (pollMsg?.metadata as Record<string, unknown> | null)?.pollOptions;
      const storedArr = Array.isArray(storedOptions)
        ? (storedOptions as { name: string; localId?: number }[])
        : [];

      // Build a fast name-lookup map keyed by localId (index position)
      // so both 0-indexed numeric and { localId } object lookups work.
      const byIndex = new Map<number, string>();
      storedArr.forEach((opt, i) => {
        const idx = typeof opt.localId === "number" ? opt.localId : i;
        byIndex.set(idx, opt.name);
      });

      // wa-js always sends number[] but we keep the multi-shape fallback for safety.
      let optionNames: string[] = [];
      const rawOpts = d.selectedOptions;
      if (Array.isArray(rawOpts)) {
        optionNames = rawOpts.flatMap((item): string[] => {
          if (item === null || item === undefined) return [];
          // plain string — use as-is
          if (typeof item === "string" && item.length > 0) return [item];
          // numeric index (the common wa-js case)
          if (typeof item === "number") {
            const name = byIndex.get(item);
            return name ? [name] : [];
          }
          // object shape { name?, localId? }
          if (typeof item === "object") {
            const obj = item as Record<string, unknown>;
            if (typeof obj.name === "string" && obj.name.length > 0) return [obj.name];
            if (typeof obj.localId === "number") {
              const name = byIndex.get(obj.localId);
              return name ? [name] : [];
            }
          }
          return [];
        });
      }

      logger.debug("WPPConnect", "onPollResponse resolved", { msgId, sender, optionNames, storedCount: storedArr.length }, sessionId);

      // Persist the vote into the poll message metadata (replaces prior vote for this sender)
      const updated = await messageRepo.upsertPollVote(sessionId, msgId, sender, optionNames);
      if (updated) {
        eventBus.publish("message.edited", { waMessageId: msgId, metadata: updated.metadata, chatId }, { sessionId, chatId });
      }
    } catch (e) { logger.error("WPPConnect", "onPollResponse failed", e, {}, sessionId); }
  });
  on<{ chat: unknown; ids: string[]; labels: unknown; type: string }>(client.onUpdateLabel as never, (d) => {
    const chatId = normalizeWhatsAppId(d.chat)?.id ?? null;
    eventBus.publish("contact.updated", { chatId, nativeLabels: d.ids, type: d.type }, { sessionId, chatId });
  });

  logger.info("WPPConnect", `attached ${disposers.length} listeners`, {}, sessionId);
  return () => { for (const d of disposers) { try { d.dispose(); } catch { /* ignore */ } } };
}
