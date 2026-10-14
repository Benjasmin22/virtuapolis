import { calculateBakeryDemand } from "./demand";

export type EngineSql = {
  query(query: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

/** Transaction callback must COMMIT only after it resolves; rejection must ROLLBACK. */
export type EngineDatabase = {
  transaction<T>(callback: (tx: EngineSql) => Promise<T>): Promise<T>;
};

export type WeekReport = {
  cityId: string;
  turn: number;
  transactions: number;
  breadUnits: number;
  wagesCents: string;
  salesCents: string;
  inputCostsCents: string;
  taxesCents: string;
};

export type AdvanceWeek = { cityId: string; userId: string; requestKey: string };

const MAX_MQ_CENTS = 9223372036854775807n;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function integer(value: unknown, name: string): number {
  invariant(typeof value === "number" && Number.isSafeInteger(value) && value >= 0, `${name}: invalid integer`);
  return value;
}

function cents(value: unknown, name: string): bigint {
  // Drivers must return BIGINT/NUMERIC as a decimal string or a bigint.
  // Accepting a JS number here would silently corrupt values above 2^53.
  invariant(typeof value === "bigint" || (typeof value === "string" && /^-?\d+$/.test(value)), `${name}: invalid integer cents`);
  const parsed = BigInt(value);
  invariant(parsed >= 0n && parsed <= MAX_MQ_CENTS, `${name}: outside BIGINT range`);
  return parsed;
}

function column(row: Record<string, unknown>, name: string): string {
  const value = row[name];
  invariant(typeof value === "string" && value.length > 0, `${name}: missing text`);
  return value;
}

async function cashBalance(tx: EngineSql, cityId: string, accountId: string): Promise<bigint> {
  const { rows } = await tx.query(`SELECT COALESCE(SUM(CASE side WHEN 'DEBIT' THEN amount_cents ELSE -amount_cents END),0)::text AS balance
    FROM ledger_entries WHERE city_id=$1 AND account_id=$2`, [cityId, accountId]);
  const balance = rows[0]?.balance;
  invariant(typeof balance === "string" && /^-?\d+$/.test(balance), "Invalid ledger balance");
  return BigInt(balance);
}

async function transfer(tx: EngineSql, args: {
  cityId: string; turn: number; eventKey: string; sourceId: string; destinationId: string;
  amount: bigint; nature: "WAGE" | "PURCHASE" | "TRANSFER" | "TAX";
}): Promise<void> {
  const { cityId, turn, eventKey, sourceId, destinationId, amount, nature } = args;
  invariant(amount > 0n && amount <= MAX_MQ_CENTS, "Transfer outside positive BIGINT range");
  invariant(sourceId !== destinationId, "Transfer requires distinct accounts");
  invariant(await cashBalance(tx, cityId, sourceId) >= amount, `Insufficient funds for ${eventKey}`);

  const { rows } = await tx.query(`INSERT INTO ledger_transactions
    (city_id,turn,event_key,source_account_id,destination_account_id,amount_cents,nature)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [cityId, turn, eventKey, sourceId, destinationId, amount.toString(), nature]);
  const id = column(rows[0], "id");
  await tx.query(`INSERT INTO ledger_entries (transaction_id,city_id,side,account_id,amount_cents)
    VALUES ($1,$2,'DEBIT',$3,$5),($1,$2,'CREDIT',$4,$5)`,
    [id, cityId, destinationId, sourceId, amount.toString()]);
}

function storedReport(value: unknown): WeekReport {
  invariant(value !== null && typeof value === "object" && !Array.isArray(value), "Completed week has no report");
  const report = value as Record<string, unknown>;
  invariant(typeof report.cityId === "string" && typeof report.turn === "number" &&
    typeof report.transactions === "number" && typeof report.breadUnits === "number" &&
    ["wagesCents", "salesCents", "inputCostsCents", "taxesCents"].every(k =>
      typeof report[k] === "string" && /^\d+$/.test(report[k])), "Malformed stored week report");
  return report as WeekReport;
}

/**
 * The week is one SQL transaction. Row locking serializes advances per city;
 * a persisted request key and report make even a lost-response retry idempotent.
 * Callers must supply the authenticated user ID; no public HTTP route yet.
 */
export async function advanceWeek(db: EngineDatabase, input: AdvanceWeek): Promise<WeekReport> {
  invariant(typeof input.cityId === "string" && typeof input.userId === "string", "City and user are required");
  invariant(typeof input.requestKey === "string" && input.requestKey.trim().length > 0 &&
    input.requestKey.length <= 128, "Request key must be 1–128 characters");

  return db.transaction(async tx => {
    const cityRows = await tx.query(`SELECT id, current_turn, bakery_elasticity_bps, sales_tax_bps, engine_version
      FROM cities WHERE id=$1 AND user_id=$2 FOR UPDATE`, [input.cityId, input.userId]);
    invariant(cityRows.rows.length === 1, "City not found or access denied");
    const city = cityRows.rows[0];
    invariant(city.engine_version === "v1", "Unsupported economic engine version");

    const previous = await tx.query("SELECT status,report FROM turn_runs WHERE city_id=$1 AND request_key=$2", [input.cityId, input.requestKey]);
    if (previous.rows.length) {
      invariant(previous.rows[0].status === "COMPLETED", "Existing turn has not completed");
      return storedReport(previous.rows[0].report);
    }

    const turn = integer(city.current_turn, "current turn") + 1;
    invariant(turn <= 2147483647, "Maximum number of weeks reached");
    const elasticityBps = integer(city.bakery_elasticity_bps, "elasticity");
    const salesTaxBps = integer(city.sales_tax_bps, "sales tax");
    invariant(elasticityBps <= 20_000 && salesTaxBps <= 10_000, "Invalid economic rates");

    const bakeries = await tx.query(`SELECT c.id,c.price_cents::text AS price_cents,
      c.reference_price_cents::text AS reference_price_cents,c.unit_cost_cents::text AS unit_cost_cents,
      c.weekly_wage_cents::text AS weekly_wage_cents,c.capacity,c.employees,a.id AS account_id
      FROM companies c LEFT JOIN accounts a ON a.city_id=c.city_id AND a.company_id=c.id AND a.kind='COMPANY_CASH'
      WHERE c.city_id=$1 AND c.kind='BAKERY' ORDER BY c.id`, [input.cityId]);
    invariant(bakeries.rows.length === 1, "The city must have exactly one bakery with a cash account");
    const bakery = bakeries.rows[0];
    const bakeryAccount = column(bakery, "account_id");
    const price = cents(bakery.price_cents, "bakery price");
    const referencePrice = cents(bakery.reference_price_cents, "reference price");
    invariant(price > 0n && referencePrice > 0n, "Bakery price and reference price must be positive");
    const unitCost = cents(bakery.unit_cost_cents, "unit cost");
    const wagePerWorker = cents(bakery.weekly_wage_cents, "weekly wage");
    const capacity = integer(bakery.capacity, "bakery capacity");
    const employees = integer(bakery.employees, "bakery employees");

    const agents = await tx.query(`SELECT h.id,h.workers,h.weekly_bread_units,a.id AS account_id
      FROM households h LEFT JOIN accounts a ON a.city_id=h.city_id AND a.household_id=h.id AND a.kind='HOUSEHOLD_CASH'
      WHERE h.city_id=$1 ORDER BY h.id`, [input.cityId]);
    invariant(agents.rows.length > 0, "The city must have households with cash accounts");
    for (const household of agents.rows) {
      invariant(typeof household.account_id === "string", "Every household must have a cash account");
    }
    const workerCount = agents.rows.reduce((total, row) => total + integer(row.workers, "household workers"), 0);
    invariant(Number.isSafeInteger(workerCount) && workerCount === employees,
      "Bakery employees must match household workers in this V1 city");

    const systemAccounts = await tx.query(`SELECT kind,id FROM accounts
      WHERE city_id=$1 AND kind IN ('TREASURY','SUPPLIER_CASH') ORDER BY kind`, [input.cityId]);
    const treasuries = systemAccounts.rows.filter(a => a.kind === "TREASURY");
    const suppliers = systemAccounts.rows.filter(a => a.kind === "SUPPLIER_CASH");
    invariant(treasuries.length === 1 && suppliers.length === 1,
      "The city needs exactly one treasury and one supplier account");

    await tx.query("INSERT INTO turn_runs (city_id,turn,request_key) VALUES ($1,$2,$3)",
      [input.cityId, turn, input.requestKey]);

    let transactionCount = 0;
    let breadUnits = 0;
    let wages = 0n;
    let sales = 0n;
    for (const household of agents.rows) {
      const householdId = column(household, "id");
      const householdAccount = column(household, "account_id");
      const weeklyWage = wagePerWorker * BigInt(integer(household.workers, "household workers"));
      if (weeklyWage > 0n) {
        await transfer(tx, { cityId:input.cityId,turn,eventKey:`wage:${householdId}`,
          sourceId:bakeryAccount,destinationId:householdAccount,amount:weeklyWage,nature:"WAGE" });
        transactionCount++;
        wages += weeklyWage;
      }
    }

    for (const household of agents.rows) {
      if (breadUnits >= capacity) break;
      const householdId = column(household, "id");
      const householdAccount = column(household, "account_id");
      const demand = calculateBakeryDemand({ referencePriceCents:referencePrice, priceCents:price,
        baselineUnits:integer(household.weekly_bread_units, "bread demand"),
        elasticityBps, capacity:capacity-breadUnits });
      const balance = await cashBalance(tx, input.cityId, householdAccount);
      const affordable = balance > 0n ? balance / price : 0n;
      const purchased = Number(BigInt(demand) < affordable ? BigInt(demand) : affordable);
      if (purchased === 0) continue;
      const payment = price * BigInt(purchased);
      await transfer(tx, { cityId:input.cityId,turn,eventKey:`bread:${householdId}`,
        sourceId:householdAccount,destinationId:bakeryAccount,amount:payment,nature:"PURCHASE" });
      transactionCount++;
      breadUnits += purchased;
      sales += payment;
      invariant(Number.isSafeInteger(breadUnits) && sales <= MAX_MQ_CENTS, "Week exceeds integer bounds");
    }

    const inputCosts = unitCost * BigInt(breadUnits);
    if (inputCosts > 0n) {
      await transfer(tx, { cityId:input.cityId,turn,eventKey:"bakery-inputs",
        sourceId:bakeryAccount,destinationId:column(suppliers[0],"id"),amount:inputCosts,nature:"TRANSFER" });
      transactionCount++;
    }
    // Tax is calculated on gross sales, once per week, rounding down to a cent.
    const taxes = sales * BigInt(salesTaxBps) / 10_000n;
    if (taxes > 0n) {
      await transfer(tx, { cityId:input.cityId,turn,eventKey:"bakery-sales-tax",
        sourceId:bakeryAccount,destinationId:column(treasuries[0],"id"),amount:taxes,nature:"TAX" });
      transactionCount++;
    }

    const report: WeekReport = {
      cityId:input.cityId,turn,transactions:transactionCount,breadUnits,
      wagesCents:wages.toString(),salesCents:sales.toString(),
      inputCostsCents:inputCosts.toString(),taxesCents:taxes.toString(),
    };
    await tx.query("UPDATE turn_runs SET status='COMPLETED',completed_at=now(),report=$3::jsonb WHERE city_id=$1 AND turn=$2",
      [input.cityId,turn,JSON.stringify(report)]);
    await tx.query("UPDATE cities SET current_turn=$2 WHERE id=$1 AND current_turn=$3",
      [input.cityId,turn,turn-1]);
    // Deferred ledger triggers verify all paired postings at COMMIT.
    return report;
  });
}
