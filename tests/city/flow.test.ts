import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { CityDatabase } from "../../src/city/database";
import { ensureDemoCity } from "../../src/city/bootstrap";
import { getCityView } from "../../src/city/projection";
import { advanceWeek } from "../../src/engine/weekly-turn";

const pg = new PGlite();
const drizzleDb = drizzle(pg);
const db: CityDatabase = {
  local:true,
  query:async (query, values=[])=>({rows:(await pg.query(query,[...values])).rows as Record<string,unknown>[]}),
  transaction:callback=>pg.transaction(tx=>callback({
    query:async (query, values=[])=>({rows:(await tx.query(query,[...values])).rows as Record<string,unknown>[]}),
  })),
};

beforeAll(async()=>{await migrate(drizzleDb,{migrationsFolder:"./drizzle"});});
afterAll(async()=>{await pg.close();});

describe("Nova Aurora server projection",()=>{
  it("seeds a balanced city once and renders its agents and initial indicators",async()=>{
    const first=await ensureDemoCity(db);
    expect(await ensureDemoCity(db)).toEqual(first);
    const city=await getCityView(db,first);
    expect(city.turn).toBe(0);
    expect(city.buildings.map(b=>b.name)).toEqual([
      "Família Oliveira","Banco Horizonte","Padaria Aurora","Família Santos","Prefeitura",
    ]);
    expect(city.indicators).toEqual({inflationBps:"0",employmentBps:"6666",gdpCents:"0",publicCashCents:"0"});
    expect(city.buildings.find(b=>b.kind==="BAKERY")?.cashCents).toBe("200000");
    const total=await pg.query<{total:string}>(`SELECT SUM(CASE e.side WHEN 'DEBIT' THEN e.amount_cents ELSE -e.amount_cents END)::text AS total
      FROM ledger_entries e WHERE city_id=$1`,[first.cityId]);
    expect(total.rows[0].total).toBe("0");
  });
  it("projects a price decision and one week from actual ledger data",async()=>{
    const identity=await ensureDemoCity(db);
    const bakery=(await getCityView(db,identity)).buildings.find(b=>b.kind==="BAKERY");
    await db.query("UPDATE companies SET price_cents=120 WHERE id=$1 AND city_id=$2",[bakery?.agentId,identity.cityId]);
    expect((await getCityView(db,identity)).indicators.inflationBps).toBe("2000");
    const report=await advanceWeek(db,{...identity,requestKey:"visual-week-1"});
    expect(report).toMatchObject({turn:1,breadUnits:14,transactions:6,salesCents:"1680",inputCostsCents:"700",taxesCents:"84"});
    const city=await getCityView(db,identity);
    expect(city.indicators).toEqual({inflationBps:"2000",employmentBps:"6666",gdpCents:"980",publicCashCents:"84"});
    expect(city.buildings.find(b=>b.kind==="BAKERY")?.cashCents).toBe("198496");
    expect(city.latestReport).toEqual(report);
    expect(await advanceWeek(db,{...identity,requestKey:"visual-week-1"})).toEqual(report);
    expect((await getCityView(db,identity)).turn).toBe(1);
  });
});
