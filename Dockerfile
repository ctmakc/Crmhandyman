# HandyCRM production image.
#
# Node 22 + standalone Next.js. better-sqlite3 is compiled for musl in both dependency
# stages; the runtime carries the Prisma CLI because migrations run before the server.

FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
ENV npm_config_build_from_source=true
RUN npm ci --omit=dev && npm cache clean --force
RUN rm -rf node_modules/@next \
           node_modules/better-sqlite3/deps \
           node_modules/better-sqlite3/src \
           node_modules/better-sqlite3/build/Release/obj \
           node_modules/better-sqlite3/build/Release/obj.target \
           node_modules/better-sqlite3/build/deps

FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
ENV npm_config_build_from_source=true
RUN npm ci
COPY . .
ENV DATABASE_URL="file:/tmp/build-placeholder.db"
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_SUPPORT_EMAIL="support@itopsi.com"
ENV NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL
ARG NEXT_PUBLIC_AUTH_ORIGIN=""
ENV NEXT_PUBLIC_AUTH_ORIGIN=$NEXT_PUBLIC_AUTH_ORIGIN
ARG NEXT_PUBLIC_DEMO_SLUG=""
ENV NEXT_PUBLIC_DEMO_SLUG=$NEXT_PUBLIC_DEMO_SLUG
ARG NEXT_PUBLIC_DEMO_EMAIL=""
ENV NEXT_PUBLIC_DEMO_EMAIL=$NEXT_PUBLIC_DEMO_EMAIL
ARG NEXT_PUBLIC_DEMO_PASSWORD=""
ENV NEXT_PUBLIC_DEMO_PASSWORD=$NEXT_PUBLIC_DEMO_PASSWORD
RUN npx prisma generate && npm run build

# Operator provisioning must work against the live volume from the runtime image. ts-node
# is deliberately a devDependency, so compile this one operational script while the build
# stage has TypeScript and ship ordinary CommonJS instead of putting a compiler in prod.
RUN mkdir -p /tmp/operator-scripts && \
    npx tsc scripts/provision-tenant.ts \
      --outDir /tmp/operator-scripts \
      --module commonjs \
      --target ES2022 \
      --moduleResolution node \
      --esModuleInterop \
      --skipLibCheck

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat sqlite
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

COPY --chown=nextjs:nodejs scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /tmp/operator-scripts/provision-tenant.js ./scripts/provision-tenant.js
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh scripts/backup.sh scripts/restore.sh

RUN mkdir -p /app/var/uploads /app/var/backups && chown -R nextjs:nodejs /app/var
VOLUME ["/app/var"]

USER nextjs
EXPOSE 3000
STOPSIGNAL SIGTERM
ENTRYPOINT ["./docker-entrypoint.sh"]
