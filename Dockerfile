# HandymanPro CRM — production image.
#
# Two facts shape this file.
#   * better-sqlite3 is a native addon. Published prebuilds are glibc, this image is
#     musl, so it is compiled from source in a stage that shares the runner's base.
#   * next.config.mjs asks for output: "standalone". A standalone build is started with
#     `node server.js`; `next start` refuses to serve it. The entrypoint below is the
#     only supported way to run this image.
#
# Node 22: Prisma 7 and better-sqlite3 12 both dropped Node 18.

# --- Stage 1: production dependencies -----------------------------------------------
# The whole production closure, exactly as the lockfile pins it. Hand-picking the few
# packages the runtime needs was tried and reverted: the Prisma CLI pulls a tree of its
# own (valibot, effect, @electric-sql …), and a list like that breaks on the next
# dependency bump — at container start, on the operator's deploy evening.
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
ENV npm_config_build_from_source=true
RUN npm ci --omit=dev && npm cache clean --force
# What a prebuilt standalone server provably never loads: the SWC compiler binaries
# (a quarter of a gigabyte) and the sources the native addon was compiled from.
RUN rm -rf node_modules/@next \
           node_modules/better-sqlite3/deps \
           node_modules/better-sqlite3/src \
           node_modules/better-sqlite3/build/Release/obj \
           node_modules/better-sqlite3/build/Release/obj.target \
           node_modules/better-sqlite3/build/deps

# --- Stage 2: build -----------------------------------------------------------------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl python3 make g++
WORKDIR /app

COPY package.json package-lock.json ./
# Prebuilt binaries are glibc; force a source build so the addon matches this libc.
ENV npm_config_build_from_source=true
RUN npm ci

COPY . .
# Placeholder only: prisma.config.ts wants a datasource url at generate time. The real
# database is the volume mounted at /app/var, handed over by the runtime environment.
ENV DATABASE_URL="file:/tmp/build-placeholder.db"
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* is inlined into the client bundle, so it has to be known here.
ARG NEXT_PUBLIC_SUPPORT_EMAIL="support@handymanpro.ca"
ENV NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL
RUN npx prisma generate && npm run build

# --- Stage 3: runtime ---------------------------------------------------------------
FROM node:22-alpine AS runner
# sqlite is here for scripts/backup.sh: an operator taking a snapshot inside the
# container should not depend on the app's node_modules being intact.
RUN apk add --no-cache libc6-compat sqlite
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

# The dependency tree first: the Prisma CLI (migrations on start), dotenv (imported by
# prisma.config.ts) and the compiled addon live here and are invisible to build tracing.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
# The standalone bundle on top only adds files, so the tree above stays complete.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# The generated client, query compiler wasm included, is produced during the build.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Schema and migrations: the entrypoint applies them, /api/health compares this folder
# against the journal in the database.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

COPY --chown=nextjs:nodejs scripts ./scripts
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh scripts/backup.sh scripts/restore.sh

# The named volume mounts here. Docker seeds a fresh volume from the image directory,
# ownership included, which is why it is created before the USER switch.
RUN mkdir -p /app/var/uploads /app/var/backups && chown -R nextjs:nodejs /app/var
VOLUME ["/app/var"]

USER nextjs
EXPOSE 3000
STOPSIGNAL SIGTERM
ENTRYPOINT ["./docker-entrypoint.sh"]
