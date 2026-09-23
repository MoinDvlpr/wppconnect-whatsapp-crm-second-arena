import { eventBus, type AppEvent } from "@/lib/events";
import { getPrincipal } from "@/lib/auth";
import { bootstrap } from "@/server/bootstrap";
export const dynamic = "force-dynamic";
/** Server-Sent Events stream: realtime updates for inbox, sessions, campaigns. */
export async function GET(req: Request) {
  await bootstrap();
  const p = await getPrincipal(req);
  if (!p) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const sessionFilter = url.searchParams.get("sessionId");
  const enc = new TextEncoder();
  let unsubscribe = () => {}; let ping: NodeJS.Timeout;
  const stream = new ReadableStream({
    start(controller) {
      const send = (e: AppEvent) => {
        if (sessionFilter && e.sessionId && e.sessionId !== sessionFilter) return;
        if (p.allowedSessions.length && e.sessionId && !p.allowedSessions.includes(e.sessionId)) return;
        try { controller.enqueue(enc.encode(`event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`)); } catch { /* closed */ }
      };
      controller.enqueue(enc.encode(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`));
      unsubscribe = eventBus.subscribeAll(send);
      ping = setInterval(() => { try { controller.enqueue(enc.encode(`: ping\n\n`)); } catch { /* closed */ } }, 20000);
    },
    cancel() { unsubscribe(); clearInterval(ping); },
  });
  req.signal.addEventListener("abort", () => { unsubscribe(); clearInterval(ping); });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
