# ---------- deps ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1 DOCKER_BUILD=true NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG DATABASE_URL
ENV DATABASE_URL="${DATABASE_URL}"

RUN npm run build

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Chromium + fonts for WPPConnect (puppeteer)
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/node_modules/drizzle-kit ./node_modules/drizzle-kit
COPY --from=deps /app/node_modules ./node_modules
COPY drizzle.config.json src/db/schema.ts ./db-schema/
COPY drizzle ./drizzle
COPY docker-entrypoint.sh ./
RUN mkdir -p /app/data/wppconnect /app/data/media && chown -R node:node /app
USER node
EXPOSE 3000
VOLUME ["/app/data"]
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "./docker-entrypoint.sh"]
