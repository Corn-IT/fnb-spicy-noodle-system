import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const databaseUrl = process.env.FNB_DATABASE_URL ?? process.env.DATABASE_URL;
if (databaseUrl && !process.env.DATABASE_URL) process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
