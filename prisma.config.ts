// Prisma 7 supports a schema folder. Keep the long-lived operational schema in
// prisma/schema.prisma and provider/reporting models in focused sibling .prisma files.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
