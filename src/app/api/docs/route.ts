import "@/server/api/routes";
import { openApiDocument } from "@/server/api/openapi";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("format") === "json") return Response.json(openApiDocument());
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>API Docs</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:'/api/docs?format=json',dom_id:'#ui',withCredentials:true})</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html" } });
}
