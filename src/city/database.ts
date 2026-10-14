import "server-only";
import { getEngineDatabase } from "@/engine/postgres";
import { getSql } from "@/db/client";
import type { EngineDatabase, EngineSql } from "@/engine/weekly-turn";

export type CityDatabase = EngineDatabase & {
  query: EngineSql["query"];
  local: boolean;
};

declare global {
  // Retain the single PGlite instance across Next.js development module reloads.
  // eslint-disable-next-line no-var
  var __virtuapolisLocalDatabase: Promise<CityDatabase> | undefined;
}

async function localDatabase(): Promise<CityDatabase> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const root = join(process.cwd(), ".local");
  await mkdir(root, { recursive: true });
  const pg = new PGlite(join(root, "preview-pg"));
  await migrate(drizzle(pg), { migrationsFolder: join(process.cwd(), "drizzle") });
  let queue = Promise.resolve();
  return {
    local: true,
    query: async (query, values = []) => {
      const result = await pg.query(query, [...values]);
      return { rows: result.rows as Record<string, unknown>[] };
    },
    transaction: <T>(callback: (tx: EngineSql) => Promise<T>) => {
      const job = queue.then(() => pg.transaction(tx => callback({
        query: async (query, values = []) => {
          const result = await tx.query(query, [...values]);
          return { rows: result.rows as Record<string, unknown>[] };
        },
      })));
      queue = job.then(() => undefined, () => undefined);
      return job;
    },
  };
}

export async function getCityDatabase(): Promise<CityDatabase> {
  if (process.env.VIRTUAPOLIS_LOCAL_DB === "1") {
    if (!globalThis.__virtuapolisLocalDatabase) {
      globalThis.__virtuapolisLocalDatabase = localDatabase().catch(error => {
        globalThis.__virtuapolisLocalDatabase = undefined;
        throw error;
      });
    }
    return globalThis.__virtuapolisLocalDatabase;
  }
  const sql = getSql();
  return {
    local: false,
    transaction: getEngineDatabase().transaction,
    query: async (query, values = []) => {
      const rows = await sql.unsafe(query, [...values] as Parameters<typeof sql.unsafe>[1]);
      return { rows: rows as Record<string, unknown>[] };
    },
  };
}
