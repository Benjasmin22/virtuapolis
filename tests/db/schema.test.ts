import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { ledgerEntries } from "../../src/db/schema";

// These are database infrastructure tests, not the Phase 2 economic engine.
const pg = new PGlite();
const db = drizzle(pg);
const user = "10000000-0000-4000-8000-000000000001";
const city = "20000000-0000-4000-8000-000000000001";
const fork = "20000000-0000-4000-8000-000000000002";
const source = "30000000-0000-4000-8000-000000000001";
const destination = "30000000-0000-4000-8000-000000000002";
const foreignAccount = "30000000-0000-4000-8000-000000000003";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pg.query("INSERT INTO users (id,email,name) VALUES ($1,'dev@example.test','Dev')", [user]);
  await pg.query("INSERT INTO cities (id,user_id,kind) VALUES ($1,$3,'MAIN'),($2,$3,'LAB')", [city, fork, user]);
  await pg.query("INSERT INTO accounts (id,city_id,code,kind) VALUES ($1,$4,'equity','OPENING_EQUITY'),($2,$4,'treasury','TREASURY'),($3,$5,'treasury','TREASURY')", [source,destination,foreignAccount,city,fork]);
  await pg.query("INSERT INTO turn_runs (city_id,turn,request_key) VALUES ($1,0,'opening')", [city]);
});
afterAll(async () => { await pg.close(); });

async function post(options: { amount?: string; debit?: string; omitCredit?: boolean; omitBoth?: boolean; debitAccount?: string; creditAccount?: string; event?: string } = {}) {
  const id = crypto.randomUUID();
  const amount = options.amount ?? "100";
  await pg.transaction(async (tx) => {
    await tx.query("INSERT INTO ledger_transactions (id,city_id,turn,event_key,source_account_id,destination_account_id,amount_cents,nature) VALUES ($1,$2,0,$3,$4,$5,$6,'OPENING')", [id,city,options.event ?? id,source,destination,amount]);
    if (!options.omitBoth) {
      await tx.query("INSERT INTO ledger_entries VALUES ($1,$2,'DEBIT',$3,$4)", [id,city,options.debitAccount ?? destination,options.debit ?? amount]);
      if (!options.omitCredit) await tx.query("INSERT INTO ledger_entries VALUES ($1,$2,'CREDIT',$3,$4)", [id,city,options.creditAccount ?? source,amount]);
    }
  });
  return id;
}

describe("Foundation: migrations and accounting constraints", () => {
  it("reapplies migrations without recreating existing tables", async () => {
    await expect(migrate(db, { migrationsFolder: "./drizzle" })).resolves.toBeUndefined();
  });
  it("persists an exact bigint above JavaScript's safe integer limit", async () => {
    const id = await post({ amount: "9007199254740993" });
    const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.transactionId,id));
    expect(entries).toHaveLength(2);
    expect(entries.every(e => e.amountCents === 9007199254740993n)).toBe(true);
  });
  it("rejects a header without postings at COMMIT", async () => {
    await expect(post({ omitBoth: true })).rejects.toThrow(/balanced pair/);
  });
  it("rejects one-sided postings and rolls back the whole header", async () => {
    await expect(post({ omitCredit: true, event: "incomplete" })).rejects.toThrow(/balanced pair/);
    const result = await pg.query("SELECT id FROM ledger_transactions WHERE event_key='incomplete'");
    expect(result.rows).toHaveLength(0);
  });
  it("rejects unequal debit and credit amounts", async () => {
    await expect(post({ debit: "99" })).rejects.toThrow(/balanced pair/);
  });
  it("rejects a pair with inverted source and destination", async () => {
    await expect(post({ debitAccount: source, creditAccount: destination })).rejects.toThrow(/balanced pair/);
  });
  it("rejects zero and negative amounts", async () => {
    await expect(post({ amount: "0" })).rejects.toThrow(/positive/);
    await expect(post({ amount: "-1" })).rejects.toThrow(/positive/);
  });
  it("rejects a posting to another city's account", async () => {
    await expect(post({ debitAccount: foreignAccount })).rejects.toThrow(/foreign key/);
  });
  it("rejects duplicate events without adding a second transfer", async () => {
    await post({ event: "unique-event" });
    await expect(post({ event: "unique-event" })).rejects.toThrow(/unique/);
  });
  it("blocks changes and deletion of posted accounting data", async () => {
    const id = await post();
    await expect(pg.query("UPDATE ledger_entries SET amount_cents=101 WHERE transaction_id=$1",[id])).rejects.toThrow(/immutable/);
    await expect(pg.query("DELETE FROM ledger_entries WHERE transaction_id=$1",[id])).rejects.toThrow(/immutable/);
    await expect(pg.query("UPDATE ledger_transactions SET amount_cents=101 WHERE id=$1",[id])).rejects.toThrow(/immutable/);
    await expect(pg.query("DELETE FROM ledger_transactions WHERE id=$1",[id])).rejects.toThrow(/immutable/);
  });
  it("blocks truncation of the ledger", async () => {
    await expect(pg.exec("TRUNCATE ledger_transactions, ledger_entries")).rejects.toThrow(/immutable/);
  });
  it("rejects duplicate weeks and reused request keys", async () => {
    await expect(pg.query("INSERT INTO turn_runs (city_id,turn,request_key) VALUES ($1,0,'different')",[city])).rejects.toThrow(/unique/);
    await expect(pg.query("INSERT INTO turn_runs (city_id,turn,request_key) VALUES ($1,1,'opening')",[city])).rejects.toThrow(/unique/);
  });
});

describe("Foundation: scenario and agent isolation", () => {
  it("requires a separate LAB city owned by the base city's user", async () => {
    await pg.query("INSERT INTO scenario_runs (user_id,base_city_id,fork_city_id,base_turn,experiment) VALUES ($1,$2,$3,0,'BAKERY_COST')",[user,city,fork]);
    await expect(pg.query("INSERT INTO scenario_runs (user_id,base_city_id,fork_city_id,base_turn,experiment) VALUES ($1,$2,$2,0,'BAKERY_COST')",[user,city])).rejects.toThrow(/isolated/);
  });
  it("rejects a scenario linking cities from different users", async () => {
    const otherUser=crypto.randomUUID(), otherCity=crypto.randomUUID();
    await pg.query("INSERT INTO users (id,email,name) VALUES ($1,'other@example.test','Other')",[otherUser]);
    await pg.query("INSERT INTO cities (id,user_id,kind) VALUES ($1,$2,'LAB')",[otherCity,otherUser]);
    await expect(pg.query("INSERT INTO scenario_runs (user_id,base_city_id,fork_city_id,base_turn,experiment) VALUES ($1,$2,$3,0,'BAKERY_COST')",[user,city,otherCity])).rejects.toThrow(/foreign key/);
  });
  it("does not let a household occupy a building from another city", async () => {
    const building=crypto.randomUUID();
    await pg.query("INSERT INTO buildings (id,city_id,kind,name,grid_x,grid_y) VALUES ($1,$2,'RESIDENCE','Casa',0,0)",[building,city]);
    await expect(pg.query("INSERT INTO households (city_id,building_id,name) VALUES ($1,$2,'Família Oliveira')",[fork,building])).rejects.toThrow(/foreign key/);
  });
  it("does not let a household occupy a bank", async () => {
    const building=crypto.randomUUID();
    await pg.query("INSERT INTO buildings (id,city_id,kind,name,grid_x,grid_y) VALUES ($1,$2,'BANK','Banco',1,0)",[building,city]);
    await expect(pg.query("INSERT INTO households (city_id,building_id,name) VALUES ($1,$2,'Família Oliveira')",[city,building])).rejects.toThrow(/foreign key/);
  });
});
