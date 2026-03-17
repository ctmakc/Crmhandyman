#!/bin/sh
set -e

# Run migrations (creates DB if not exists)
npx prisma migrate deploy --schema ./prisma/schema.prisma

# Start the app
exec node server.js
