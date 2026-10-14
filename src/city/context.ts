import "server-only";
import { ensureDemoCity } from "./bootstrap";
import { getCityDatabase } from "./database";

/** Fase 3 local preview: a single server-side demo identity, no browser-supplied user ID. */
export async function demoContext() {
  if (process.env.VIRTUAPOLIS_DEMO !== "1") {
    throw new Error("Ative VIRTUAPOLIS_DEMO=1 para visualizar a cidade local.");
  }
  const db=await getCityDatabase();
  const identity=await ensureDemoCity(db);
  return {db,identity};
}
