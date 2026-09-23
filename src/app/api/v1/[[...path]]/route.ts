import { dispatch } from "@/server/api/router";
import "@/server/api/routes";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
type P = { params: Promise<{ path?: string[] }> };
const h = async (req: Request, { params }: P) => dispatch(req, (await params).path ?? []);
export { h as GET, h as POST, h as PUT, h as PATCH, h as DELETE };
