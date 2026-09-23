import { z, type ZodType } from "zod";
import { ApiError, fail, ok, parseBody } from "@/lib/api";
import { requireAuth, rateLimit, clientIp, type Principal, type Role } from "@/lib/auth";
import { bootstrap } from "../bootstrap";
import { logger } from "@/lib/logger";

export interface Ctx { req: Request; url: URL; params: Record<string, string>; principal: Principal; ip: string | null; body<T>(schema: ZodType<T>): Promise<T>; }
type Handler = (ctx: Ctx) => Promise<unknown | Response>;
interface Route { method: string; pattern: RegExp; keys: string[]; role: Role; handler: Handler; doc?: RouteDoc; }
export interface RouteDoc { summary: string; tag: string; body?: Record<string, unknown>; query?: Record<string, string>; example?: unknown; }

const routes: Route[] = [];
function compile(path: string) {
  const keys: string[] = [];
  const src = path.replace(/\//g, "\\/").replace(/:(\w+)/g, (_m, k: string) => { keys.push(k); return "([^\\/]+)"; });
  return { pattern: new RegExp(`^${src}\\/?$`), keys };
}
export function route(method: string, path: string, role: Role, handler: Handler, doc?: RouteDoc) {
  const { pattern, keys } = compile(path);
  routes.push({ method, pattern, keys, role, handler, doc: doc ? { ...doc } : undefined });
  (routes[routes.length - 1] as Route & { path: string }).path = path;
}
export function listRoutes() { return routes.map((r) => ({ method: r.method, path: (r as Route & { path: string }).path, role: r.role, doc: r.doc })); }

export async function dispatch(req: Request, pathParts: string[]): Promise<Response> {
  await bootstrap();
  const url = new URL(req.url);
  const path = "/" + pathParts.join("/");
  const started = Date.now();
  try {
    const candidates = routes.filter((r) => r.pattern.test(path));
    if (!candidates.length) throw new ApiError("NOT_FOUND", `Route ${path} not found`, 404);
    const r = candidates.find((c) => c.method === req.method);
    if (!r) throw new ApiError("METHOD_NOT_ALLOWED", `Method ${req.method} not allowed`, 405);
    const ip = clientIp(req);
    rateLimit(`ip:${ip ?? "local"}`, Number(process.env.API_RATE_LIMIT || 300));
    const principal = await requireAuth(req, r.role);
    const m = path.match(r.pattern)!;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    const ctx: Ctx = { req, url, params, principal, ip, body: (schema) => parseBody(req, schema) };
    const result = await r.handler(ctx);
    if (result instanceof Response) return result;
    return ok(result);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status >= 500) logger.error("API", `${req.method} ${path} failed`, e, { durationMs: Date.now() - started });
    return fail(e);
  }
}
export const idParam = z.string().min(1);
