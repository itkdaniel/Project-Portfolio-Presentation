## ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build


## ── Stage 2: production runtime ──────────────────────────────────────────────
FROM node:20-alpine AS runtime

LABEL maintainer="NexusConsult <team@nexusconsult.dev>"
LABEL description="NexusConsult main web application"

WORKDIR /app

RUN addgroup -S nexus && adduser -S nexus -G nexus

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=5000

USER nexus
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/projects || exit 1

CMD ["node", "./dist/index.cjs"]