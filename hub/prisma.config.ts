import dotenv from 'dotenv';
import { defineConfig, env } from "prisma/config";

// Load environment variables from .env file
dotenv.config();

const datasource: { url: string; shadowDatabaseUrl?: string } = {
  url: env("DATABASE_URL"),
};
if (process.env.SHADOW_DATABASE_URL?.trim()) {
  datasource.shadowDatabaseUrl = env("SHADOW_DATABASE_URL");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource,
});
