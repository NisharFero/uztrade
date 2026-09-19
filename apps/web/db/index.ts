import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof createPostgresDb>;

let db: Db | null = null;

function createPostgresDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required for UzTrade's Postgres database. Set it in Vercel, or in apps/web/.env.local for local production-mode testing.",
    );
  }
  return drizzle(neon(url), { schema });
}

export function getDb(): Db {
  db ??= createPostgresDb();
  return db;
}

