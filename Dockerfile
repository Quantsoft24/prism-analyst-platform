# ── Build stage ──
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Next.js inlines NEXT_PUBLIC_* statically at BUILD time. They MUST be
# present as env vars when `next build` runs — passing them via the
# compose `environment:` block (runtime) is too late. The compose file's
# `build.args:` populates these ARGs at image-build time.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_LANDING_URL
ARG NEXT_PUBLIC_LIVE_API
ARG NEXT_PUBLIC_STREAMING
ARG NEXT_PUBLIC_AUTH
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_LANDING_URL=${NEXT_PUBLIC_LANDING_URL} \
    NEXT_PUBLIC_LIVE_API=${NEXT_PUBLIC_LIVE_API} \
    NEXT_PUBLIC_STREAMING=${NEXT_PUBLIC_STREAMING} \
    NEXT_PUBLIC_AUTH=${NEXT_PUBLIC_AUTH}

RUN npm run build

# ── Production stage ──
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
