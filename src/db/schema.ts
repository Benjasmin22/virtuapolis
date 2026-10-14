import { sql } from "drizzle-orm";
import {
  bigint, check, foreignKey, index, integer, jsonb, pgEnum, pgTable,
  primaryKey, text, timestamp, unique, uuid,
} from "drizzle-orm/pg-core";

// MQ is always integer cents: PostgreSQL BIGINT <-> TypeScript bigint.
// No mutable balance columns: balances will be projections of the ledger.
const money = (name: string) => bigint(name, { mode: "bigint" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const cityKind = pgEnum("city_kind", ["MAIN", "LAB"]);
export const buildingKind = pgEnum("building_kind", ["RESIDENCE", "BAKERY", "BANK", "CITY_HALL"]);
export const accountKind = pgEnum("account_kind", ["HOUSEHOLD_CASH", "COMPANY_CASH", "TREASURY", "OPENING_EQUITY", "SUPPLIER_CASH"]);
export const entrySide = pgEnum("entry_side", ["DEBIT", "CREDIT"]);
export const transactionNature = pgEnum("transaction_nature", ["OPENING", "PURCHASE", "WAGE", "TAX", "TRANSFER", "LOAN", "REPAYMENT", "INTEREST"]);
export const turnStatus = pgEnum("turn_status", ["PENDING", "COMPLETED"]);
export const scenarioStatus = pgEnum("scenario_status", ["READY", "COMPLETED", "ARCHIVED"]);
export const experimentKind = pgEnum("experiment_kind", ["INTEREST_CREDIT", "BAKERY_COST", "PUBLIC_BUDGET"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const cities = pgTable("cities", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  name: text("name").notNull().default("Nova Aurora"),
  kind: cityKind("kind").notNull().default("MAIN"),
  currentTurn: integer("current_turn").notNull().default(0),
  bakeryElasticityBps: integer("bakery_elasticity_bps").notNull().default(10000),
  salesTaxBps: integer("sales_tax_bps").notNull().default(500),
  engineVersion: text("engine_version").notNull().default("v1"),
  createdAt: createdAt(),
}, (t) => [
  unique("cities_owner_kind_key").on(t.id, t.userId, t.kind),
  index("cities_owner_idx").on(t.userId),
  check("cities_turn_nonnegative", sql`${t.currentTurn} >= 0`),
  check("cities_rates_bounded", sql`${t.bakeryElasticityBps} BETWEEN 0 AND 20000 AND ${t.salesTaxBps} BETWEEN 0 AND 10000`),
]);

export const buildings = pgTable("buildings", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityId: uuid("city_id").notNull().references(() => cities.id, { onDelete: "restrict" }),
  kind: buildingKind("kind").notNull(),
  name: text("name").notNull(),
  gridX: integer("grid_x").notNull(),
  gridY: integer("grid_y").notNull(),
}, (t) => [
  unique("buildings_scoped_key").on(t.cityId, t.id, t.kind),
  unique("buildings_grid_key").on(t.cityId, t.gridX, t.gridY),
  check("buildings_grid_nonnegative", sql`${t.gridX} >= 0 AND ${t.gridY} >= 0`),
]);

export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityId: uuid("city_id").notNull().references(() => cities.id, { onDelete: "restrict" }),
  buildingId: uuid("building_id").notNull(),
  buildingKind: buildingKind("building_kind").notNull().default("RESIDENCE"),
  name: text("name").notNull(),
  members: integer("members").notNull().default(1),
  workingAgeMembers: integer("working_age_members").notNull().default(1),
  workers: integer("workers").notNull().default(0),
  weeklyBreadUnits: integer("weekly_bread_units").notNull().default(10),
}, (t) => [
  unique("households_scoped_key").on(t.cityId, t.id),
  unique("households_building_key").on(t.cityId, t.buildingId),
  foreignKey({ columns: [t.cityId, t.buildingId, t.buildingKind], foreignColumns: [buildings.cityId, buildings.id, buildings.kind] }),
  check("households_residence", sql`${t.buildingKind} = 'RESIDENCE'`),
  check("households_population", sql`${t.members} > 0 AND ${t.workingAgeMembers} BETWEEN 0 AND ${t.members} AND ${t.workers} BETWEEN 0 AND ${t.workingAgeMembers}`),
  check("households_bread_nonnegative", sql`${t.weeklyBreadUnits} >= 0`),
]);

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityId: uuid("city_id").notNull().references(() => cities.id, { onDelete: "restrict" }),
  buildingId: uuid("building_id").notNull(),
  kind: buildingKind("kind").notNull(),
  name: text("name").notNull(),
  priceCents: money("price_cents").notNull().default(sql`0`),
  referencePriceCents: money("reference_price_cents").notNull().default(sql`0`),
  unitCostCents: money("unit_cost_cents").notNull().default(sql`0`),
  weeklyWageCents: money("weekly_wage_cents").notNull().default(sql`0`),
  capacity: integer("capacity").notNull().default(0),
  employees: integer("employees").notNull().default(0),
}, (t) => [
  unique("companies_scoped_key").on(t.cityId, t.id),
  unique("companies_building_key").on(t.cityId, t.buildingId),
  foreignKey({ columns: [t.cityId, t.buildingId, t.kind], foreignColumns: [buildings.cityId, buildings.id, buildings.kind] }),
  check("companies_kind", sql`${t.kind} IN ('BAKERY', 'BANK')`),
  check("companies_nonnegative", sql`${t.priceCents} >= 0 AND ${t.referencePriceCents} >= 0 AND ${t.unitCostCents} >= 0 AND ${t.weeklyWageCents} >= 0 AND ${t.capacity} >= 0 AND ${t.employees} >= 0`),
]);

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityId: uuid("city_id").notNull().references(() => cities.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  kind: accountKind("kind").notNull(),
  householdId: uuid("household_id"),
  companyId: uuid("company_id"),
}, (t) => [
  unique("accounts_scoped_key").on(t.cityId, t.id),
  unique("accounts_code_key").on(t.cityId, t.code),
  unique("accounts_household_key").on(t.cityId, t.householdId),
  unique("accounts_company_key").on(t.cityId, t.companyId),
  foreignKey({ columns: [t.cityId, t.householdId], foreignColumns: [households.cityId, households.id] }),
  foreignKey({ columns: [t.cityId, t.companyId], foreignColumns: [companies.cityId, companies.id] }),
  check("accounts_owner", sql`(
    (${t.kind} = 'HOUSEHOLD_CASH' AND ${t.householdId} IS NOT NULL AND ${t.companyId} IS NULL) OR
    (${t.kind} = 'COMPANY_CASH' AND ${t.companyId} IS NOT NULL AND ${t.householdId} IS NULL) OR
    (${t.kind} IN ('TREASURY', 'OPENING_EQUITY', 'SUPPLIER_CASH') AND ${t.householdId} IS NULL AND ${t.companyId} IS NULL)
  )`),
]);

// A weekly turn commits its ledger and state in ONE SQL transaction.
export const turnRuns = pgTable("turn_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityId: uuid("city_id").notNull().references(() => cities.id, { onDelete: "restrict" }),
  turn: integer("turn").notNull(),
  requestKey: text("request_key").notNull(),
  status: turnStatus("status").notNull().default("PENDING"),
  createdAt: createdAt(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  report: jsonb("report").$type<Record<string, string | number>>(),
}, (t) => [
  unique("turn_runs_week_key").on(t.cityId, t.turn),
  unique("turn_runs_request_key").on(t.cityId, t.requestKey),
  check("turn_runs_nonnegative", sql`${t.turn} >= 0`),
  check("turn_runs_completion", sql`(${t.status} = 'COMPLETED') = (${t.completedAt} IS NOT NULL AND ${t.report} IS NOT NULL)`),
]);

// Header records origin, destination, amount, turn and nature.
// A transfer credits the source cash account and debits the destination cash account.
export const ledgerTransactions = pgTable("ledger_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityId: uuid("city_id").notNull().references(() => cities.id, { onDelete: "restrict" }),
  turn: integer("turn").notNull(),
  eventKey: text("event_key").notNull(),
  sourceAccountId: uuid("source_account_id").notNull(),
  destinationAccountId: uuid("destination_account_id").notNull(),
  amountCents: money("amount_cents").notNull(),
  nature: transactionNature("nature").notNull(),
  createdAt: createdAt(),
}, (t) => [
  unique("ledger_transactions_scoped_key").on(t.cityId, t.id),
  unique("ledger_transactions_event_key").on(t.cityId, t.turn, t.eventKey),
  foreignKey({ columns: [t.cityId, t.turn], foreignColumns: [turnRuns.cityId, turnRuns.turn] }),
  foreignKey({ columns: [t.cityId, t.sourceAccountId], foreignColumns: [accounts.cityId, accounts.id] }),
  foreignKey({ columns: [t.cityId, t.destinationAccountId], foreignColumns: [accounts.cityId, accounts.id] }),
  check("ledger_transactions_positive", sql`${t.amountCents} > 0`),
  check("ledger_transactions_distinct_accounts", sql`${t.sourceAccountId} <> ${t.destinationAccountId}`),
]);

// Exactly two immutable rows per transaction: DEBIT and CREDIT.
// Cross-row balance/matching is enforced at COMMIT by the custom SQL migration.
export const ledgerEntries = pgTable("ledger_entries", {
  transactionId: uuid("transaction_id").notNull(),
  cityId: uuid("city_id").notNull(),
  side: entrySide("side").notNull(),
  accountId: uuid("account_id").notNull(),
  amountCents: money("amount_cents").notNull(),
}, (t) => [
  primaryKey({ columns: [t.transactionId, t.side] }),
  foreignKey({ columns: [t.cityId, t.transactionId], foreignColumns: [ledgerTransactions.cityId, ledgerTransactions.id] }),
  foreignKey({ columns: [t.cityId, t.accountId], foreignColumns: [accounts.cityId, accounts.id] }),
  index("ledger_entries_account_idx").on(t.cityId, t.accountId),
  check("ledger_entries_positive", sql`${t.amountCents} > 0`),
]);

// Only a MAIN city may be the base; only a separate LAB city may be the fork.
// Composite FKs force both cities to belong to the same user.
export const scenarioRuns = pgTable("scenario_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  baseCityId: uuid("base_city_id").notNull(),
  baseCityKind: cityKind("base_city_kind").notNull().default("MAIN"),
  forkCityId: uuid("fork_city_id").notNull().unique(),
  forkCityKind: cityKind("fork_city_kind").notNull().default("LAB"),
  baselineForkCityId: uuid("baseline_fork_city_id").unique(),
  baseTurn: integer("base_turn").notNull(),
  experiment: experimentKind("experiment").notNull(),
  // Fixed-point rates: 100 basis points = 1%; monetary deltas remain bigint.
  interestDeltaBps: integer("interest_delta_bps").notNull().default(0),
  costShockBps: integer("cost_shock_bps").notNull().default(0),
  publicBudgetDeltaCents: money("public_budget_delta_cents").notNull().default(sql`0`),
  status: scenarioStatus("status").notNull().default("READY"),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ columns: [t.baseCityId, t.userId, t.baseCityKind], foreignColumns: [cities.id, cities.userId, cities.kind] }),
  foreignKey({ columns: [t.forkCityId, t.userId, t.forkCityKind], foreignColumns: [cities.id, cities.userId, cities.kind] }),
  foreignKey({ columns: [t.baselineForkCityId, t.userId, t.forkCityKind], foreignColumns: [cities.id, cities.userId, cities.kind] }),
  check("scenario_runs_isolated", sql`${t.baseCityId} <> ${t.forkCityId} AND ${t.baseCityKind} = 'MAIN' AND ${t.forkCityKind} = 'LAB'`),
  check("scenario_runs_baseline_isolated", sql`${t.baselineForkCityId} IS NULL OR (${t.baselineForkCityId} <> ${t.forkCityId} AND ${t.baselineForkCityId} <> ${t.baseCityId})`),
  check("scenario_runs_turn_nonnegative", sql`${t.baseTurn} >= 0`),
  check("scenario_runs_cost_floor", sql`${t.costShockBps} >= -10000`),
]);

export type User = typeof users.$inferSelect;
export type City = typeof cities.$inferSelect;
export type Building = typeof buildings.$inferSelect;
export type Household = typeof households.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type ScenarioRun = typeof scenarioRuns.$inferSelect;
