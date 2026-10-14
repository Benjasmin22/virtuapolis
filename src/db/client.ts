import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy: a production build must not connect to the database.
let database: ReturnType<typeof createDatabase> | undefined;
let client: ReturnType<typeof postgres> | undefined;
export function getSql() {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida.");
  client = postgres(url, { max: 5 });
  return client;
}
function createDatabase() {
  return drizzle(getSql(), { schema });
}
export function getDatabase() { return database ??= createDatabase(); }
