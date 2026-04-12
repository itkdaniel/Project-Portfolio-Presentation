FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl

# ── Dependencies ──────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --only=production

# ── Build ──────────────────────────────────────────────────────────────────
FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Production ─────────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production

COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
COPY package.json ./

EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD curl -f http://localhost:3001/health || exit 1

USER node
CMD ["node", "dist/index.js"]
