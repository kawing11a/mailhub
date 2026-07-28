# Base image
FROM node:20-alpine AS base
WORKDIR /app

# Dependencies
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN --mount=type=cache,target=/root/.npm \
    npm ci
RUN npx prisma generate

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# Runner
FROM base AS runner
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# We need tsx to run the worker if running in worker mode
# Doing this before copying source code caches this layer
RUN npm install -g tsx

# Copy standalone files and static/public assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy source and config required by worker containers (npm run worker)
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Default command for the web service
CMD ["node", "server.js"]
