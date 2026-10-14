import type { CityDatabase } from "./database";
import type { DemoIdentity } from "./bootstrap";
import type { WeekReport } from "@/engine/weekly-turn";

export type BuildingKind = "RESIDENCE" | "BAKERY" | "BANK" | "CITY_HALL";
export type Activity = { nature: string; side: "DEBIT" | "CREDIT"; amountCents: string; eventKey: string };
export type CityBuilding = {
  id: string; agentId: string | null; kind: BuildingKind; name: string; x: number; y: number;
  cashCents: string; earnedCents: string; spentCents: string; activity: Activity[];
  members?: number; workingAgeMembers?: number; workers?: number; weeklyBreadUnits?: number;
  employees?: number; priceCents?: string; referencePriceCents?: string; unitCostCents?: string;
};
export type CityView = {
  id: string; name: string; turn: number; salesTaxBps: string; buildings: CityBuilding[];
  indicators: { inflationBps: string; employmentBps: string; gdpCents: string; publicCashCents: string };
  latestReport: WeekReport | null;
};

function string(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string") throw new Error(`Projeção inválida: ${field}`);
  return value;
}
function number(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`Projeção inválida: ${field}`);
  return value;
}

/** The dashboard is a read-only projection. It never advances weeks or writes balances. */
export async function getCityView(db: Pick<CityDatabase,"query">, identity: DemoIdentity): Promise<CityView> {
  const cityRows = await db.query("SELECT id,name,current_turn,sales_tax_bps FROM cities WHERE id=$1 AND user_id=$2",[identity.cityId,identity.userId]);
  if (cityRows.rows.length !== 1) throw new Error("Cidade indisponível.");
  const city=cityRows.rows[0];
  const turn=number(city,"current_turn");
  const [buildingRows,householdRows,companyRows,accountRows,activityRows,reportRows] = await Promise.all([
    db.query("SELECT id,kind,name,grid_x,grid_y FROM buildings WHERE city_id=$1 ORDER BY grid_y,grid_x",[identity.cityId]),
    db.query("SELECT id,building_id,name,members,working_age_members,workers,weekly_bread_units FROM households WHERE city_id=$1",[identity.cityId]),
    db.query(`SELECT id,building_id,kind,employees,price_cents::text AS price_cents,
      reference_price_cents::text AS reference_price_cents,unit_cost_cents::text AS unit_cost_cents
      FROM companies WHERE city_id=$1`,[identity.cityId]),
    db.query(`SELECT a.id,a.kind,a.household_id,a.company_id,
      COALESCE(SUM(CASE e.side WHEN 'DEBIT' THEN e.amount_cents ELSE -e.amount_cents END),0)::text AS balance
      FROM accounts a LEFT JOIN ledger_entries e ON e.city_id=a.city_id AND e.account_id=a.id
      WHERE a.city_id=$1 GROUP BY a.id,a.kind,a.household_id,a.company_id`,[identity.cityId]),
    db.query(`SELECT e.account_id,e.side,e.amount_cents::text AS amount_cents,t.nature,t.event_key
      FROM ledger_entries e JOIN ledger_transactions t ON t.city_id=e.city_id AND t.id=e.transaction_id
      WHERE e.city_id=$1 AND t.turn=$2 ORDER BY t.created_at,t.id,e.side`,[identity.cityId,turn]),
    db.query("SELECT report FROM turn_runs WHERE city_id=$1 AND turn=$2 AND status='COMPLETED'",[identity.cityId,turn]),
  ]);

  const accountByAgent = new Map<string,Record<string,unknown>>();
  const activityByAccount = new Map<string,Activity[]>();
  let treasury: Record<string,unknown> | undefined;
  for (const account of accountRows.rows) {
    const owner=account.household_id ?? account.company_id;
    if (typeof owner === "string") accountByAgent.set(owner,account);
    if (account.kind === "TREASURY") treasury=account;
  }
  for (const entry of activityRows.rows) {
    const accountId=string(entry,"account_id");
    const activity=activityByAccount.get(accountId) ?? [];
    activity.push({ nature:string(entry,"nature"),side:entry.side as Activity["side"],
      amountCents:string(entry,"amount_cents"),eventKey:string(entry,"event_key") });
    activityByAccount.set(accountId,activity);
  }
  const householdByBuilding=new Map(householdRows.rows.map(row=>[row.building_id,row]));
  const companyByBuilding=new Map(companyRows.rows.map(row=>[row.building_id,row]));
  const buildings: CityBuilding[] = buildingRows.rows.map(building => {
    const id=string(building,"id");
    const kind=string(building,"kind") as BuildingKind;
    const household=householdByBuilding.get(id);
    const company=companyByBuilding.get(id);
    const agentId=household ? string(household,"id") : company ? string(company,"id") : null;
    const account=kind === "CITY_HALL" ? treasury : agentId ? accountByAgent.get(agentId) : undefined;
    const accountId=account ? string(account,"id") : "";
    const activity=activityByAccount.get(accountId) ?? [];
    const earned=activity.filter(e=>e.side === "DEBIT").reduce((sum,e)=>sum+BigInt(e.amountCents),0n);
    const spent=activity.filter(e=>e.side === "CREDIT").reduce((sum,e)=>sum+BigInt(e.amountCents),0n);
    return {
      id,agentId,kind,name:household?string(household,"name"):string(building,"name"),x:number(building,"grid_x"),y:number(building,"grid_y"),
      cashCents:account ? string(account,"balance") : "0",earnedCents:earned.toString(),spentCents:spent.toString(),activity,
      ...(household ? {members:number(household,"members"),workingAgeMembers:number(household,"working_age_members"),
        workers:number(household,"workers"),weeklyBreadUnits:number(household,"weekly_bread_units")} : {}),
      ...(company ? {employees:number(company,"employees"),priceCents:string(company,"price_cents"),
        referencePriceCents:string(company,"reference_price_cents"),unitCostCents:string(company,"unit_cost_cents")} : {}),
    };
  });

  const bakery=buildings.find(b=>b.kind==="BAKERY");
  const workAge=buildings.filter(b=>b.kind==="RESIDENCE").reduce((sum,b)=>sum+(b.workingAgeMembers??0),0);
  const employees=bakery?.employees??0;
  const reference=BigInt(bakery?.referencePriceCents??"0");
  const price=BigInt(bakery?.priceCents??"0");
  const inflationBps=reference>0n ? (price-reference)*10000n/reference : 0n;
  const employmentBps=workAge>0 ? BigInt(employees)*10000n/BigInt(workAge) : 0n;
  const latestReport=turn>0 && reportRows.rows[0]?.report ? reportRows.rows[0].report as WeekReport : null;
  const gdp=latestReport ? BigInt(latestReport.salesCents)-BigInt(latestReport.inputCostsCents) : 0n;
  return {
    id:string(city,"id"),name:string(city,"name"),turn,salesTaxBps:String(number(city,"sales_tax_bps")),buildings,
    indicators:{inflationBps:inflationBps.toString(),employmentBps:employmentBps.toString(),
      gdpCents:gdp.toString(),publicCashCents:treasury ? string(treasury,"balance") : "0"},
    latestReport,
  };
}
