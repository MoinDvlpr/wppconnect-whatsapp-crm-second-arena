import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: unknown) { super(message); }
}
export const notFound = (what = "Resource") => new ApiError("NOT_FOUND", `${what} not found`, 404);
export const unauthorized = (m = "Authentication required") => new ApiError("UNAUTHORIZED", m, 401);
export const forbidden = (m = "Insufficient permissions") => new ApiError("FORBIDDEN", m, 403);
export const sessionNotReady = () => new ApiError("SESSION_NOT_READY", "WhatsApp session is not ready", 409);
export const unsupported = (m = "Not supported by current WPPConnect version/session.") => new ApiError("UNSUPPORTED", m, 501);

export function ok<T>(data: T, init?: ResponseInit) { return NextResponse.json({ success: true, data }, init); }
export function fail(err: unknown) {
  if (err instanceof ApiError) return NextResponse.json({ success: false, error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  if (err instanceof ZodError) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid input", details: err.flatten() } }, { status: 422 });
  const message = err instanceof Error ? err.message : "Unexpected error";
  const code = /not ready|not connected|No client/i.test(message) ? "SESSION_NOT_READY" : "INTERNAL_ERROR";
  return NextResponse.json({ success: false, error: { code, message: sanitize(message) } }, { status: code === "SESSION_NOT_READY" ? 409 : 500 });
}
function sanitize(m: string) { return m.replace(/postgres(ql)?:\/\/\S+/gi, "[redacted]").slice(0, 500); }

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try { json = await req.json(); } catch { throw new ApiError("VALIDATION_ERROR", "Invalid JSON body", 422); }
  return schema.parse(json);
}
export function parseQuery<T>(url: URL, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(url.searchParams.entries()));
}
export function newId(): string { return crypto.randomUUID(); }
export function pageParams(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  return { page, limit, offset: (page - 1) * limit };
}
