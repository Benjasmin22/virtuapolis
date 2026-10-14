import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { advanceWeek, type EngineDatabase } from "../../src/engine/weekly-turn";

const pg = new PGlite();
const db = drizzle(pg);

beforeAll(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
afterAll(async () => { await pg.close(); });

function adapter(failTaxOnce = false): EngineDatabase {
  let pendingFailure = failTaxOnce;
  return {
    transaction: async (callback) => pg.transaction(async tx => callback({
      query: async (query, values = []) => {
        if (pendingFailure && query.startsWith("INSERT INTO ledger_transactions") && values.includes("TAX")) {
          pendingFailure = false;
          throw new Error("injected tax write failure");
        }
        const result = await tx.query(query, [...values]);
        return { rows: result.rows as Record<string, unknown>[] };
      },
    })),
  };
}

async function opening(cityId: string, source: string, destination: string, amount: string, event: string) {
  const id = randomUUID();
  await pg.transaction(async tx => {
    await tx.query("INSERT INTO ledger_transactions (id,city_id,turn,event_key,source_account_id,destination_account_id,amount_cents,nature) VALUES ($1,$2,0,$3,$4,$5,$6,'OPENING')", [id,cityId,event,source,destination,amount]);
    await tx.query("INSERT INTO ledger_entries (transaction_id,city_id,side,account_id,amount_cents) VALUES ($1,$2,'DEBIT',$3,$5),($1,$2,'CREDIT',$4,$5)", [id,cityId,destination,source,amount]);
  });
}

async function fixture(options: { price?: string; companyCash?: string; kind?: "MAIN"|"LAB";
  householdCash?: string; wage?: string; capacity?: number } = {}) {
  const ids = {
    user: randomUUID(), city: randomUUID(), bakery: randomUUID(), household: randomUUID(),
    home: randomUUID(), shop: randomUUID(), equity: randomUUID(),
    bakeryCash: randomUUID(), familyCash: randomUUID(), treasury: randomUUID(), supplier: randomUUID(),
  };
  await pg.query("INSERT INTO users (id,email,name) VALUES ($1,$2,'Tester')",[ids.user,`${ids.user}@example.test`]);
  await pg.query("INSERT INTO cities (id,user_id,kind,bakery_elasticity_bps,sales_tax_bps) VALUES ($1,$2,$3,10000,500)",[ids.city,ids.user,options.kind??"MAIN"]);
  await pg.query("INSERT INTO buildings (id,city_id,kind,name,grid_x,grid_y) VALUES ($1,$3,'RESIDENCE','Casa Oliveira',0,0),($2,$3,'BAKERY','Padaria',1,0)",[ids.home,ids.shop,ids.city]);
  await pg.query("INSERT INTO households (id,city_id,building_id,name,members,workers,weekly_bread_units) VALUES ($1,$2,$3,'Oliveira',3,1,10)",[ids.household,ids.city,ids.home]);
  await pg.query("INSERT INTO companies (id,city_id,building_id,kind,name,price_cents,reference_price_cents,unit_cost_cents,weekly_wage_cents,capacity,employees) VALUES ($1,$2,$3,'BAKERY','Padaria', $4,100,30,$5,$6,1)",[ids.bakery,ids.city,ids.shop,options.price??"100",options.wage??"1000",options.capacity??20]);
  await pg.query("INSERT INTO accounts (id,city_id,code,kind,household_id,company_id) VALUES ($1,$6,'equity','OPENING_EQUITY',NULL,NULL),($2,$6,'bakery','COMPANY_CASH',NULL,$7),($3,$6,'family','HOUSEHOLD_CASH',$8,NULL),($4,$6,'treasury','TREASURY',NULL,NULL),($5,$6,'supplier','SUPPLIER_CASH',NULL,NULL)",[ids.equity,ids.bakeryCash,ids.familyCash,ids.treasury,ids.supplier,ids.city,ids.bakery,ids.household]);
  await pg.query("INSERT INTO turn_runs (city_id,turn,request_key,status,completed_at,report) VALUES ($1,0,'opening','COMPLETED',now(),'{}'::jsonb)",[ids.city]);
  if (options.companyCash !== "0") await opening(ids.city,ids.equity,ids.bakeryCash,options.companyCash??"100000","opening:bakery");
  if (options.householdCash !== "0") await opening(ids.city,ids.equity,ids.familyCash,options.householdCash??"2000","opening:family");
  return ids;
}

async function balances(cityId: string) {
  const result = await pg.query<{code:string,balance:string}>(`SELECT a.code, COALESCE(SUM(CASE e.side WHEN 'DEBIT' THEN e.amount_cents ELSE -e.amount_cents END),0)::text AS balance
    FROM accounts a LEFT JOIN ledger_entries e ON e.city_id=a.city_id AND e.account_id=a.id
    WHERE a.city_id=$1 GROUP BY a.code ORDER BY a.code`,[cityId]);
  return Object.fromEntries(result.rows.map(row => [row.code,BigInt(row.balance)]));
}

describe("Phase 2: financial weekly engine", () => {
  it("posts wages, purchases, inputs and taxes as perfectly balanced pairs", async () => {
    const ids = await fixture();
    const report = await advanceWeek(adapter(),{cityId:ids.city,userId:ids.user,requestKey:"week-1"});
    expect(report).toEqual({cityId:ids.city,turn:1,transactions:4,breadUnits:10,wagesCents:"1000",salesCents:"1000",inputCostsCents:"300",taxesCents:"50"});
    const postings=await pg.query<{nature:string,side:string,account_id:string,amount_cents:string}>(`SELECT t.nature,e.side,e.account_id,e.amount_cents::text FROM ledger_transactions t JOIN ledger_entries e ON e.city_id=t.city_id AND e.transaction_id=t.id
      WHERE t.city_id=$1 AND t.turn=1 ORDER BY t.nature,e.side`,[ids.city]);
    expect(postings.rows).toHaveLength(8);
    const expected: Record<string,[string,string,string]> = {
      WAGE:[ids.bakeryCash,ids.familyCash,"1000"], PURCHASE:[ids.familyCash,ids.bakeryCash,"1000"],
      TRANSFER:[ids.bakeryCash,ids.supplier,"300"], TAX:[ids.bakeryCash,ids.treasury,"50"],
    };
    for (const [nature,[source,destination,amount]] of Object.entries(expected)) {
      expect(postings.rows.filter(r => r.nature===nature)).toEqual([
        {nature,side:"DEBIT",account_id:destination,amount_cents:amount},
        {nature,side:"CREDIT",account_id:source,amount_cents:amount},
      ]);
    }
    expect(await balances(ids.city)).toEqual({bakery:99650n,equity:-102000n,family:2000n,supplier:300n,treasury:50n});
    expect(Object.values(await balances(ids.city)).reduce((sum,value)=>sum+value,0n)).toBe(0n);
  });

  it("limits demand by price, available capacity and household funds", async () => {
    const costly=await fixture({price:"200"});
    const noSales=await advanceWeek(adapter(),{cityId:costly.city,userId:costly.user,requestKey:"expensive"});
    expect(noSales.breadUnits).toBe(0);
    expect(noSales.transactions).toBe(1); // wages still flow
    const poor=await fixture({householdCash:"0"});
    const affordable=await advanceWeek(adapter(),{cityId:poor.city,userId:poor.user,requestKey:"affordability"});
    expect(affordable.breadUnits).toBe(10); // weekly wage provides 1000 cents
    const limited=await fixture({householdCash:"250",wage:"0"});
    const shortCash=await advanceWeek(adapter(),{cityId:limited.city,userId:limited.user,requestKey:"cash-limit"});
    expect(shortCash.breadUnits).toBe(2);
    const smallOven=await fixture({capacity:3});
    const capacityReport=await advanceWeek(adapter(),{cityId:smallOven.city,userId:smallOven.user,requestKey:"capacity-limit"});
    expect(capacityReport.breadUnits).toBe(3);
    const insolvent=await fixture({companyCash:"0"});
    await expect(advanceWeek(adapter(),{cityId:insolvent.city,userId:insolvent.user,requestKey:"insolvent"})).rejects.toThrow(/insufficient/i);
    expect((await pg.query<{current_turn:number}>("SELECT current_turn FROM cities WHERE id=$1",[insolvent.city])).rows[0].current_turn as number).toBe(0);
  });

  it("returns the stored report for a repeated request and does not duplicate ledger entries", async () => {
    const ids=await fixture();
    const first=await advanceWeek(adapter(),{cityId:ids.city,userId:ids.user,requestKey:"same-key"});
    const second=await advanceWeek(adapter(),{cityId:ids.city,userId:ids.user,requestKey:"same-key"});
    expect(second).toEqual(first);
    expect((await pg.query<{count:number}>("SELECT count(*)::int AS count FROM turn_runs WHERE city_id=$1",[ids.city])).rows[0].count as number).toBe(2); // opening + week 1
    expect((await pg.query<{count:number}>("SELECT count(*)::int AS count FROM ledger_transactions WHERE city_id=$1 AND turn=1",[ids.city])).rows[0].count as number).toBe(4);
    const third=await advanceWeek(adapter(),{cityId:ids.city,userId:ids.user,requestKey:"new-key"});
    expect(third.turn).toBe(2);
    expect(await advanceWeek(adapter(),{cityId:ids.city,userId:ids.user,requestKey:"same-key"})).toEqual(first);
  });

  it("rolls back a mid-turn failure and safely retries the same request", async () => {
    const ids=await fixture();
    const faulty=adapter(true);
    const before=await balances(ids.city);
    await expect(advanceWeek(faulty,{cityId:ids.city,userId:ids.user,requestKey:"retry-key"})).rejects.toThrow(/injected tax write failure/);
    expect(await balances(ids.city)).toEqual(before);
    expect((await pg.query<{current_turn:number}>("SELECT current_turn FROM cities WHERE id=$1",[ids.city])).rows[0].current_turn as number).toBe(0);
    expect((await pg.query<{count:number}>("SELECT count(*)::int AS count FROM turn_runs WHERE city_id=$1",[ids.city])).rows[0].count as number).toBe(1);
    const recovered=await advanceWeek(faulty,{cityId:ids.city,userId:ids.user,requestKey:"retry-key"});
    expect(recovered.turn).toBe(1);
    expect(recovered.transactions).toBe(4);
  });

  it("rejects a foreign user and advances a LAB fork without touching MAIN", async () => {
    const main=await fixture();
    const lab=await fixture({kind:"LAB"});
    await expect(advanceWeek(adapter(),{cityId:main.city,userId:lab.user,requestKey:"foreign"})).rejects.toThrow(/not found|access/i);
    await advanceWeek(adapter(),{cityId:lab.city,userId:lab.user,requestKey:"lab-week"});
    expect((await pg.query<{current_turn:number}>("SELECT current_turn FROM cities WHERE id=$1",[main.city])).rows[0].current_turn as number).toBe(0);
    expect((await pg.query<{current_turn:number}>("SELECT current_turn FROM cities WHERE id=$1",[lab.city])).rows[0].current_turn as number).toBe(1);
  });

  it("refuses an unbanked household instead of silently leaving it out", async () => {
    const ids=await fixture();
    const home=randomUUID();
    await pg.query("INSERT INTO buildings (id,city_id,kind,name,grid_x,grid_y) VALUES ($1,$2,'RESIDENCE','Another home',2,0)",[home,ids.city]);
    await pg.query("INSERT INTO households (city_id,building_id,name,members,workers) VALUES ($1,$2,'Another family',1,0)",[ids.city,home]);
    await expect(advanceWeek(adapter(),{cityId:ids.city,userId:ids.user,requestKey:"missing-family-account"})).rejects.toThrow(/cash account/);
    expect((await pg.query<{current_turn:number}>("SELECT current_turn FROM cities WHERE id=$1",[ids.city])).rows[0].current_turn).toBe(0);
  });

  it("refuses a second bakery without an account instead of silently omitting it", async () => {
    const ids=await fixture();
    const shop=randomUUID();
    await pg.query("INSERT INTO buildings (id,city_id,kind,name,grid_x,grid_y) VALUES ($1,$2,'BAKERY','Second shop',2,0)",[shop,ids.city]);
    await pg.query("INSERT INTO companies (city_id,building_id,kind,name,price_cents,reference_price_cents) VALUES ($1,$2,'BAKERY','Second bakery',100,100)",[ids.city,shop]);
    await expect(advanceWeek(adapter(),{cityId:ids.city,userId:ids.user,requestKey:"missing-bakery-account"})).rejects.toThrow(/exactly one bakery/);
  });
});
