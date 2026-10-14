import "server-only";
import { getSql } from "@/db/client";
import type { EngineDatabase } from "./weekly-turn";

let engineDatabase: EngineDatabase | undefined;

/** Production adapter. Transaction isolation is provided by PostgreSQL.
 * advanceWeek acquires a per-city FOR UPDATE row lock before reading state. */
export function getEngineDatabase(): EngineDatabase {
  if (engineDatabase) return engineDatabase;
  const sql = getSql();
  const instance: EngineDatabase = {
    transaction: <T>(callback: (tx: import("./weekly-turn").EngineSql) => Promise<T>): Promise<T> =>
      sql.begin(async tx => callback({
      query: async (query, values = []) => {
        // All engine parameters are already validated as strings or integers.
        const params = [...values] as Parameters<typeof tx.unsafe>[1];
        const rows = await tx.unsafe(query, params);
        return { rows: rows as Record<string, unknown>[] };
      },
    })) as unknown as Promise<T>,
  };
  engineDatabase = instance;
  return instance;
}
