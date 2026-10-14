import type { CityDatabase } from "./database";
import type { EngineSql } from "@/engine/weekly-turn";

export type DemoIdentity = { userId: string; cityId: string };

function id(rows: Record<string, unknown>[]): string {
  const result = rows[0]?.id;
  if (typeof result !== "string") throw new Error("A criação da cidade não retornou um identificador.");
  return result;
}

async function createBuilding(tx: EngineSql, cityId: string, kind: string, name: string, x: number, y: number) {
  const result = await tx.query("INSERT INTO buildings (city_id,kind,name,grid_x,grid_y) VALUES ($1,$2,$3,$4,$5) RETURNING id",[cityId,kind,name,x,y]);
  return id(result.rows);
}

async function account(tx: EngineSql, cityId: string, code: string, kind: string, ownerColumn?: "household_id" | "company_id", ownerId?: string) {
  const query = ownerColumn === "household_id"
    ? "INSERT INTO accounts (city_id,code,kind,household_id) VALUES ($1,$2,$3,$4) RETURNING id"
    : ownerColumn === "company_id"
      ? "INSERT INTO accounts (city_id,code,kind,company_id) VALUES ($1,$2,$3,$4) RETURNING id"
      : "INSERT INTO accounts (city_id,code,kind) VALUES ($1,$2,$3) RETURNING id";
  const result = await tx.query(query, ownerColumn ? [cityId,code,kind,ownerId] : [cityId,code,kind]);
  return id(result.rows);
}

async function opening(tx: EngineSql, cityId: string, equityId: string, destinationId: string, cents: string, event: string) {
  const result = await tx.query(`INSERT INTO ledger_transactions
    (city_id,turn,event_key,source_account_id,destination_account_id,amount_cents,nature)
    VALUES ($1,0,$2,$3,$4,$5,'OPENING') RETURNING id`,[cityId,event,equityId,destinationId,cents]);
  await tx.query(`INSERT INTO ledger_entries (transaction_id,city_id,side,account_id,amount_cents)
    VALUES ($1,$2,'DEBIT',$3,$5),($1,$2,'CREDIT',$4,$5)`,[id(result.rows),cityId,destinationId,equityId,cents]);
}

/**
 * Seeds one private, single-user demo city. All balance creation uses paired
 * opening ledger entries; the procedure commits or rolls back as a whole.
 */
export async function ensureDemoCity(db: CityDatabase): Promise<DemoIdentity> {
  return db.transaction(async tx => {
    if (!db.local) await tx.query("SELECT pg_advisory_xact_lock(hashtext('virtuapolis:single-user-demo'))");
    const user = await tx.query(`INSERT INTO users (email,name) VALUES ('demo@virtuapolis.local','Explorador')
      ON CONFLICT (email) DO UPDATE SET name=excluded.name RETURNING id`);
    const userId = id(user.rows);
    const existing = await tx.query("SELECT id FROM cities WHERE user_id=$1 AND kind='MAIN' ORDER BY created_at,id LIMIT 1",[userId]);
    if (existing.rows.length > 0) return {userId,cityId:id(existing.rows)};

    const city = await tx.query("INSERT INTO cities (user_id,name,kind,engine_version) VALUES ($1,'Nova Aurora','MAIN','v1') RETURNING id",[userId]);
    const cityId=id(city.rows);
    const oliveiraHome=await createBuilding(tx,cityId,"RESIDENCE","Casa Oliveira",0,0);
    const santosHome=await createBuilding(tx,cityId,"RESIDENCE","Casa Santos",0,3);
    const bakeryBuilding=await createBuilding(tx,cityId,"BAKERY","Padaria Aurora",2,1);
    const bankBuilding=await createBuilding(tx,cityId,"BANK","Banco Horizonte",4,0);
    await createBuilding(tx,cityId,"CITY_HALL","Prefeitura",4,3);

    const oliveira=await tx.query(`INSERT INTO households
      (city_id,building_id,name,members,working_age_members,workers,weekly_bread_units)
      VALUES ($1,$2,'Família Oliveira',4,2,1,10) RETURNING id`,[cityId,oliveiraHome]);
    const santos=await tx.query(`INSERT INTO households
      (city_id,building_id,name,members,working_age_members,workers,weekly_bread_units)
      VALUES ($1,$2,'Família Santos',2,1,1,8) RETURNING id`,[cityId,santosHome]);
    const bakery=await tx.query(`INSERT INTO companies
      (city_id,building_id,kind,name,price_cents,reference_price_cents,unit_cost_cents,weekly_wage_cents,capacity,employees)
      VALUES ($1,$2,'BAKERY','Padaria Aurora',100,100,50,1200,24,2) RETURNING id`,[cityId,bakeryBuilding]);
    const bank=await tx.query("INSERT INTO companies (city_id,building_id,kind,name) VALUES ($1,$2,'BANK','Banco Horizonte') RETURNING id",[cityId,bankBuilding]);

    const equity=await account(tx,cityId,"opening-equity","OPENING_EQUITY");
    const bakeryCash=await account(tx,cityId,"bakery-cash","COMPANY_CASH","company_id",id(bakery.rows));
    const bankCash=await account(tx,cityId,"bank-cash","COMPANY_CASH","company_id",id(bank.rows));
    const oliveiraCash=await account(tx,cityId,"oliveira-cash","HOUSEHOLD_CASH","household_id",id(oliveira.rows));
    const santosCash=await account(tx,cityId,"santos-cash","HOUSEHOLD_CASH","household_id",id(santos.rows));
    await account(tx,cityId,"public-treasury","TREASURY");
    await account(tx,cityId,"input-supplier","SUPPLIER_CASH");

    await tx.query(`INSERT INTO turn_runs (city_id,turn,request_key,status,completed_at,report)
      VALUES ($1,0,'opening','COMPLETED',now(),$2::jsonb)`,[cityId,JSON.stringify({
        cityId,turn:0,transactions:4,breadUnits:0,wagesCents:"0",salesCents:"0",inputCostsCents:"0",taxesCents:"0",
      })]);
    await opening(tx,cityId,equity,bakeryCash,"200000","opening:bakery");
    await opening(tx,cityId,equity,bankCash,"60000","opening:bank");
    await opening(tx,cityId,equity,oliveiraCash,"8000","opening:oliveira");
    await opening(tx,cityId,equity,santosCash,"6000","opening:santos");
    return {userId,cityId};
  });
}
