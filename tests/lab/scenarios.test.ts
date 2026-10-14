import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { CityDatabase } from "../../src/city/database";
import { ensureDemoCity } from "../../src/city/bootstrap";
import { getCityView } from "../../src/city/projection";
import { runScenario, getScenarioComparison } from "../../src/lab/scenarios";
import { advanceWeek } from "../../src/engine/weekly-turn";

const pg=new PGlite();
const db:CityDatabase={
  local:true,
  query:async(query,values=[])=>({rows:(await pg.query(query,[...values])).rows as Record<string,unknown>[]}),
  transaction:callback=>pg.transaction(tx=>callback({
    query:async(query,values=[])=>({rows:(await tx.query(query,[...values])).rows as Record<string,unknown>[]}),
  })),
};
beforeAll(async()=>{await migrate(drizzle(pg),{migrationsFolder:"./drizzle"});});
afterAll(async()=>{await pg.close();});

describe("Lab sandbox",()=>{
  it("clones the same ledger snapshot twice, keeps the MAIN untouched and compares cost shock",async()=>{
    const identity=await ensureDemoCity(db);
    const before=await getCityView(db,identity);
    const comparison=await runScenario(db,{...identity,experiment:"BAKERY_COST",value:5000});
    expect(comparison.base.cityId).not.toBe(comparison.simulated.cityId);
    expect(comparison.base.cityId).not.toBe(identity.cityId);
    expect(comparison.base.turn).toBe(1);
    expect(comparison.simulated.turn).toBe(1);
    expect(comparison.base.salesCents).toBe(comparison.simulated.salesCents);
    expect(BigInt(comparison.simulated.inputCostsCents)).toBe(BigInt(comparison.base.inputCostsCents)*3n/2n);
    expect(BigInt(comparison.simulated.gdpCents)).toBeLessThan(BigInt(comparison.base.gdpCents));
    expect(await getCityView(db,identity)).toEqual(before);
    expect(await getScenarioComparison(db,identity,comparison.id)).toEqual(comparison);
    const types=await db.query("SELECT kind,COUNT(*)::integer AS count FROM cities GROUP BY kind ORDER BY kind");
    expect(types.rows).toEqual([{kind:"MAIN",count:1},{kind:"LAB",count:2}]);
  });

  it("models one-week bank credit with integer interest and paired ledger entries",async()=>{
    const identity=await ensureDemoCity(db);
    const result=await runScenario(db,{...identity,experiment:"INTEREST_CREDIT",value:1000});
    expect(result.effects).toMatchObject({principalCents:"1000",interestCents:"100"});
    expect(result.simulated.bankCashCents).toBe(
      (BigInt(result.base.bankCashCents)+100n).toString());
    const movements=await db.query(`SELECT nature,COUNT(*)::integer AS count FROM ledger_transactions
      WHERE city_id=$1 AND nature IN ('LOAN','REPAYMENT','INTEREST') GROUP BY nature ORDER BY nature`,[result.simulated.cityId]);
    expect(movements.rows).toEqual([
      {nature:"LOAN",count:1},{nature:"REPAYMENT",count:1},{nature:"INTEREST",count:1},
    ]);
    const balance=await db.query(`SELECT COALESCE(SUM(CASE side WHEN 'DEBIT' THEN amount_cents ELSE -amount_cents END),0)::text AS total
      FROM ledger_entries WHERE city_id=$1`,[result.simulated.cityId]);
    expect(balance.rows[0].total).toBe("0");
  });

  it("limits public spending to collected taxes without making money",async()=>{
    const identity=await ensureDemoCity(db);
    const result=await runScenario(db,{...identity,experiment:"PUBLIC_BUDGET",value:"100"});
    expect(result.effects.publicSpendingCents).toBe(result.base.publicCashCents);
    expect(result.simulated.publicCashCents).toBe("0");
    expect((await getCityView(db,identity)).turn).toBe(0);
  });

  it("rejects invalid interventions and inaccessible scenarios without creating forks",async()=>{
    const identity=await ensureDemoCity(db);
    const before=(await db.query("SELECT COUNT(*)::integer AS count FROM scenario_runs")).rows[0].count;
    await expect(runScenario(db,{...identity,experiment:"BAKERY_COST",value:-10001})).rejects.toThrow();
    await expect(getScenarioComparison(db,{...identity,userId:"00000000-0000-4000-8000-000000000000"},"00000000-0000-4000-8000-000000000000")).rejects.toThrow();
    expect((await db.query("SELECT COUNT(*)::integer AS count FROM scenario_runs")).rows[0].count).toBe(before);
  });

  it("forks an already advanced MAIN at its current turn and preserves its history",async()=>{
    const identity=await ensureDemoCity(db);
    await advanceWeek(db,{...identity,requestKey:"main-before-lab"});
    const main=await getCityView(db,identity);
    const result=await runScenario(db,{...identity,experiment:"BAKERY_COST",value:1000});
    expect(result.baseTurn).toBe(1);
    expect(result.base.turn).toBe(2);
    expect(result.simulated.turn).toBe(2);
    expect(await getCityView(db,identity)).toEqual(main);
    const history=await db.query("SELECT COUNT(*)::integer AS count FROM ledger_transactions WHERE city_id=$1 AND turn<=$2 AND nature<>'OPENING'",
      [result.base.cityId,result.baseTurn]);
    expect(history.rows[0].count).toBe(0);
  });

  it("rolls back both cloned cities if the final scenario record fails",async()=>{
    const identity=await ensureDemoCity(db);
    const countBefore=(await db.query("SELECT COUNT(*)::integer AS count FROM cities")).rows[0].count;
    const rejectsAtFinalRecord:CityDatabase={...db,transaction:callback=>db.transaction(tx=>callback({
      query:(query,values)=>query.startsWith("INSERT INTO scenario_runs")
        ? Promise.reject(new Error("simulated final write failure")) : tx.query(query,values),
    }))};
    await expect(runScenario(rejectsAtFinalRecord,{...identity,experiment:"BAKERY_COST",value:2500}))
      .rejects.toThrow("simulated final write failure");
    expect((await db.query("SELECT COUNT(*)::integer AS count FROM cities")).rows[0].count).toBe(countBefore);
  });
});
