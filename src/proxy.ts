import { NextResponse, type NextRequest } from "next/server";
/** Route protection for browser pages: redirects unauthenticated users to /login. API routes validate on their own. */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname === "/login" || pathname.includes(".")) return NextResponse.next();
  if (!req.cookies.get("wacrm_session")?.value) { const url = req.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", pathname); return NextResponse.redirect(url); }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
