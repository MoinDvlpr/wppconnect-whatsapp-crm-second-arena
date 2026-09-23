#!/bin/sh
set -e
echo "[entrypoint] applying database schema..."
# schema push (idempotent). Uses SUPABASE_DB_URL from environment.
node -e '
const fs=require("fs");const cfg={dialect:"postgresql",schema:"./db-schema/schema.ts",out:"./drizzle",dbCredentials:{url:process.env.SUPABASE_DB_URL}};
fs.writeFileSync("/tmp/drizzle.config.json",JSON.stringify(cfg));'
npx --no-install drizzle-kit migrate --config=/tmp/drizzle.config.json \
  || npx --no-install drizzle-kit push --config=/tmp/drizzle.config.json --force \
  || echo "[entrypoint] schema migration failed (continuing)"
echo "[entrypoint] starting server"
exec node server.js
