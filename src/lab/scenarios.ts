import type { CityDatabase } from "../city/database";
import type { DemoIdentity } from "../city/bootstrap";
import { getCityView } from "../city/projection";
import { advanceWeek, type EngineSql, type WeekReport } from "../engine/weekly-turn";

export type Experiment = "INTEREST_CREDIT" | "BAKERY_COST" | "PUBLIC_BUDGET";
export type ScenarioInput = DemoIdentity & { experiment:Experiment; value:number|string };
export type ScenarioMetrics = WeekReport & {
  gdpCents:string;publicCashCents:string;bankCashCents:string;familyCashCents:string;
  bakeryCashCents:string;inflationBps:string;employmentBps:string;
};
export type ScenarioComparison = {
  id:string;experiment:Experiment;value:number|string;baseTurn:number;
  base:ScenarioMetrics;simulated:ScenarioMetrics;
  effects:{principalCents:string;interestCents:string;publicSpendingCents:string};
};

function cell(row:Record<string,unknown>,key:string):string {
  const value=row[key];
  if(typeof value!=="string") throw new Error(`Dados incompletos: ${key}`);
  return value;
}
function whole(row:Record<string,unknown>,key:string):number {
  const value=row[key];
  if(typeof value!=="number"||!Number.isSafeInteger(value)) throw new Error(`Valor inválido: ${key}`);
  return value;
}
function only(rows:Record<string,unknown>[]):Record<string,unknown> {
  if(rows.length!==1) throw new Error("Agente ou cidade indisponível.");
  return rows[0];
}
async function insertId(tx:EngineSql,sql:string,values:readonly unknown[]):Promise<string> {
  return cell(only((await tx.query(sql,values)).rows),"id");
}
function validate(input:ScenarioInput):void {
  if(!input||typeof input.cityId!=="string"||typeof input.userId!=="string")
    throw new Error("Parâmetros do experimento inválidos.");
  if(input.experiment==="PUBLIC_BUDGET") {
    if(typeof input.value!=="string"||!/^\d+$/.test(input.value)||BigInt(input.value)>10000n)
      throw new Error("Orçamento fora dos limites do experimento.");
  } else if(input.experiment==="BAKERY_COST"||input.experiment==="INTEREST_CREDIT") {
    const min=input.experiment==="BAKERY_COST"?-10000:0;
    const max=input.experiment==="BAKERY_COST"?20000:2000;
    if(typeof input.value!=="number"||!Number.isSafeInteger(input.value)||input.value<min||input.value>max)
      throw new Error("Taxa fora dos limites do experimento.");
  } else throw new Error("Experimento desconhecido.");
}
function rate(input:ScenarioInput):number {
  if(typeof input.value!=="number") throw new Error("Taxa inválida.");
  return input.value;
}
function budget(input:ScenarioInput):bigint {
  if(typeof input.value!=="string") throw new Error("Orçamento inválido.");
  return BigInt(input.value);
}

/** A snapshot copies structure and net account positions, never historical transactions. */
async function cloneCity(tx:EngineSql,source:Record<string,unknown>,userId:string):Promise<string> {
  const baseId=cell(source,"id");
  const turn=whole(source,"current_turn");
  const forkId=await insertId(tx,`INSERT INTO cities
    (user_id,name,kind,current_turn,bakery_elasticity_bps,sales_tax_bps,engine_version)
    VALUES ($1,$2,'LAB',$3,$4,$5,$6) RETURNING id`,[
    userId,`${cell(source,"name")} · Lab`,turn,whole(source,"bakery_elasticity_bps"),
    whole(source,"sales_tax_bps"),cell(source,"engine_version"),
  ]);
  const buildingIds=new Map<string,string>();
  for(const row of (await tx.query("SELECT * FROM buildings WHERE city_id=$1 ORDER BY id",[baseId])).rows) {
    buildingIds.set(cell(row,"id"),await insertId(tx,`INSERT INTO buildings
      (city_id,kind,name,grid_x,grid_y) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [forkId,row.kind,row.name,row.grid_x,row.grid_y]));
  }
  const householdIds=new Map<string,string>();
  for(const row of (await tx.query("SELECT * FROM households WHERE city_id=$1 ORDER BY id",[baseId])).rows) {
    householdIds.set(cell(row,"id"),await insertId(tx,`INSERT INTO households
      (city_id,building_id,building_kind,name,members,working_age_members,workers,weekly_bread_units)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[
      forkId,buildingIds.get(cell(row,"building_id")),row.building_kind,row.name,row.members,
      row.working_age_members,row.workers,row.weekly_bread_units,
    ]));
  }
  const companyIds=new Map<string,string>();
  for(const row of (await tx.query(`SELECT *,price_cents::text AS price,
    reference_price_cents::text AS reference_price,unit_cost_cents::text AS unit_cost,
    weekly_wage_cents::text AS weekly_wage FROM companies WHERE city_id=$1 ORDER BY id`,[baseId])).rows) {
    companyIds.set(cell(row,"id"),await insertId(tx,`INSERT INTO companies
      (city_id,building_id,kind,name,price_cents,reference_price_cents,unit_cost_cents,weekly_wage_cents,capacity,employees)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[
      forkId,buildingIds.get(cell(row,"building_id")),row.kind,row.name,row.price,row.reference_price,
      row.unit_cost,row.weekly_wage,row.capacity,row.employees,
    ]));
  }
  const accounts=(await tx.query(`SELECT a.*,COALESCE(SUM(CASE e.side WHEN 'DEBIT'
    THEN e.amount_cents ELSE -e.amount_cents END),0)::text AS balance
    FROM accounts a LEFT JOIN ledger_entries e ON e.city_id=a.city_id AND e.account_id=a.id
    WHERE a.city_id=$1 GROUP BY a.id ORDER BY a.id`,[baseId])).rows;
  let equity="";
  const openings:{id:string;amount:string;code:string}[]=[];
  for(const row of accounts) {
    const kind=cell(row,"kind");
    const id=await insertId(tx,`INSERT INTO accounts (city_id,code,kind,household_id,company_id)
      VALUES ($1,$2,$3,$4,$5) RETURNING id`,[
      forkId,row.code,kind,row.household_id?householdIds.get(cell(row,"household_id")):null,
      row.company_id?companyIds.get(cell(row,"company_id")):null,
    ]);
    if(kind==="OPENING_EQUITY") equity=id;
    else {
      const amount=BigInt(cell(row,"balance"));
      if(amount<0n) throw new Error("O fork encontrou uma conta de caixa negativa.");
      if(amount>0n) openings.push({id,amount:amount.toString(),code:cell(row,"code")});
    }
  }
  if(!equity) throw new Error("O fork requer uma conta de patrimônio inicial.");
  await tx.query(`INSERT INTO turn_runs (city_id,turn,request_key,status,completed_at,report)
    VALUES ($1,$2,'fork:opening','COMPLETED',now(),$3::jsonb)`,[
    forkId,turn,JSON.stringify({cityId:forkId,turn,transactions:openings.length,breadUnits:0,
      wagesCents:"0",salesCents:"0",inputCostsCents:"0",taxesCents:"0"}),
  ]);
  for(const item of openings) await posting(tx,forkId,turn,`fork:opening:${item.code}`,equity,item.id,item.amount,"OPENING");
  return forkId;
}

async function posting(tx:EngineSql,cityId:string,turn:number,event:string,source:string,destination:string,
  amount:string,nature:"OPENING"|"LOAN"|"REPAYMENT"|"INTEREST"|"TRANSFER"):Promise<void> {
  if(BigInt(amount)<=0n||source===destination) throw new Error("Lançamento inválido.");
  const id=await insertId(tx,`INSERT INTO ledger_transactions
    (city_id,turn,event_key,source_account_id,destination_account_id,amount_cents,nature)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[cityId,turn,event,source,destination,amount,nature]);
  await tx.query(`INSERT INTO ledger_entries (transaction_id,city_id,side,account_id,amount_cents)
    VALUES ($1,$2,'DEBIT',$3,$5),($1,$2,'CREDIT',$4,$5)`,[id,cityId,destination,source,amount]);
}

async function cashAccount(tx:EngineSql,cityId:string,kind:"BANK"|"RESIDENCE"|"TREASURY") {
  const rows=kind==="TREASURY" ? (await tx.query("SELECT id FROM accounts WHERE city_id=$1 AND kind='TREASURY'",[cityId])).rows
    : kind==="BANK" ? (await tx.query(`SELECT a.id FROM accounts a JOIN companies c
      ON c.city_id=a.city_id AND c.id=a.company_id WHERE a.city_id=$1 AND c.kind='BANK'`,[cityId])).rows
      : (await tx.query(`SELECT a.id FROM accounts a JOIN households h
        ON h.city_id=a.city_id AND h.id=a.household_id WHERE a.city_id=$1 ORDER BY h.name LIMIT 1`,[cityId])).rows;
  return cell(only(rows),"id");
}
async function balance(tx:EngineSql,cityId:string,accountId:string):Promise<bigint> {
  const row=only((await tx.query(`SELECT COALESCE(SUM(CASE side WHEN 'DEBIT' THEN amount_cents
    ELSE -amount_cents END),0)::text AS balance FROM ledger_entries
    WHERE city_id=$1 AND account_id=$2`,[cityId,accountId])).rows);
  return BigInt(cell(row,"balance"));
}
async function metrics(tx:EngineSql,userId:string,cityId:string):Promise<ScenarioMetrics> {
  const view=await getCityView(tx,{userId,cityId});
  const report=view.latestReport;
  if(!report||report.turn!==view.turn) throw new Error("Cenário sem semana concluída.");
  return {...report,gdpCents:view.indicators.gdpCents,publicCashCents:view.indicators.publicCashCents,
    bankCashCents:view.buildings.find(b=>b.kind==="BANK")?.cashCents??"0",
    familyCashCents:view.buildings.find(b=>b.name==="Família Oliveira")?.cashCents??"0",
    bakeryCashCents:view.buildings.find(b=>b.kind==="BAKERY")?.cashCents??"0",
    inflationBps:view.indicators.inflationBps,employmentBps:view.indicators.employmentBps};
}

async function comparison(tx:EngineSql,identity:DemoIdentity,scenarioId:string):Promise<ScenarioComparison> {
  const row=only((await tx.query(`SELECT id,experiment,interest_delta_bps,cost_shock_bps,
    public_budget_delta_cents::text AS public_budget_delta_cents,base_turn,
    fork_city_id,baseline_fork_city_id FROM scenario_runs WHERE id=$1 AND user_id=$2 AND base_city_id=$3
    AND status='COMPLETED'`,[scenarioId,identity.userId,identity.cityId])).rows);
  const experiment=cell(row,"experiment") as Experiment;
  const cityId=cell(row,"fork_city_id");
  const baseCityId=cell(row,"baseline_fork_city_id");
  const value=experiment==="INTEREST_CREDIT"?whole(row,"interest_delta_bps"):
    experiment==="BAKERY_COST"?whole(row,"cost_shock_bps"):cell(row,"public_budget_delta_cents");
  const effects=(await tx.query(`SELECT nature,COALESCE(SUM(amount_cents),0)::text AS total
    FROM ledger_transactions WHERE city_id=$1 AND nature IN ('LOAN','INTEREST','TRANSFER')
    AND event_key LIKE 'lab:%' GROUP BY nature`,[cityId])).rows;
  const byNature=new Map(effects.map(r=>[cell(r,"nature"),cell(r,"total")]));
  return {id:scenarioId,experiment,value,baseTurn:whole(row,"base_turn"),
    base:await metrics(tx,identity.userId,baseCityId),simulated:await metrics(tx,identity.userId,cityId),
    effects:{principalCents:byNature.get("LOAN")??"0",interestCents:byNature.get("INTEREST")??"0",
      publicSpendingCents:byNature.get("TRANSFER")??"0"}};
}

/** One transaction contains both snapshots, both weeks, and the final comparison. */
export async function runScenario(db:CityDatabase,input:ScenarioInput):Promise<ScenarioComparison> {
  validate(input);
  return db.transaction(async tx=>{
    const source=only((await tx.query(`SELECT * FROM cities WHERE id=$1 AND user_id=$2 AND kind='MAIN'
      FOR UPDATE`,[input.cityId,input.userId])).rows);
    const baseTurn=whole(source,"current_turn");
    const baselineId=await cloneCity(tx,source,input.userId);
    const simulationId=await cloneCity(tx,source,input.userId);
    let bank="",family="";
    if(input.experiment==="BAKERY_COST") {
      const bakery=only((await tx.query(`SELECT id,unit_cost_cents::text AS cost FROM companies
        WHERE city_id=$1 AND kind='BAKERY'`,[simulationId])).rows);
      const cost=BigInt(cell(bakery,"cost"))*BigInt(10000+rate(input))/10000n;
      await tx.query("UPDATE companies SET unit_cost_cents=$3 WHERE city_id=$1 AND id=$2",
        [simulationId,bakery.id,cost.toString()]);
    }
    if(input.experiment==="INTEREST_CREDIT") {
      bank=await cashAccount(tx,simulationId,"BANK");
      family=await cashAccount(tx,simulationId,"RESIDENCE");
      if(await balance(tx,simulationId,bank)<1000n) throw new Error("Banco sem caixa para o crédito.");
      await posting(tx,simulationId,baseTurn,"lab:credit",bank,family,"1000","LOAN");
    }
    const wrapped={transaction:<T>(callback:(sql:EngineSql)=>Promise<T>)=>callback(tx)};
    await advanceWeek(wrapped,{userId:input.userId,cityId:baselineId,requestKey:"lab:baseline:week"});
    await advanceWeek(wrapped,{userId:input.userId,cityId:simulationId,requestKey:"lab:simulation:week"});
    if(input.experiment==="INTEREST_CREDIT") {
      const interest=1000n*BigInt(rate(input))/10000n;
      if(await balance(tx,simulationId,family)<1000n+interest) throw new Error("Família sem caixa para quitar o crédito.");
      await posting(tx,simulationId,baseTurn+1,"lab:principal",family,bank,"1000","REPAYMENT");
      if(interest>0n) await posting(tx,simulationId,baseTurn+1,"lab:interest",family,bank,interest.toString(),"INTEREST");
    }
    if(input.experiment==="PUBLIC_BUDGET") {
      const treasury=await cashAccount(tx,simulationId,"TREASURY");
      const recipient=await cashAccount(tx,simulationId,"RESIDENCE");
      const available=await balance(tx,simulationId,treasury);
      const spend=available<budget(input)?available:budget(input);
      if(spend>0n) await posting(tx,simulationId,baseTurn+1,"lab:public-spending",treasury,recipient,
        spend.toString(),"TRANSFER");
    }
    const id=await insertId(tx,`INSERT INTO scenario_runs
      (user_id,base_city_id,fork_city_id,baseline_fork_city_id,base_turn,experiment,
      interest_delta_bps,cost_shock_bps,public_budget_delta_cents,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'COMPLETED') RETURNING id`,[
      input.userId,input.cityId,simulationId,baselineId,baseTurn,input.experiment,
      input.experiment==="INTEREST_CREDIT"?rate(input):0,
      input.experiment==="BAKERY_COST"?rate(input):0,
      input.experiment==="PUBLIC_BUDGET"?budget(input).toString():"0",
    ]);
    return comparison(tx,input,id);
  });
}

export async function getScenarioComparison(db:Pick<CityDatabase,"query">,identity:DemoIdentity,id:string):Promise<ScenarioComparison> {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new Error("Cenário inválido.");
  return comparison(db,identity,id);
}

export async function listScenarios(db:Pick<CityDatabase,"query">,identity:DemoIdentity):Promise<{id:string;experiment:Experiment;baseTurn:number}[]> {
  const rows=(await db.query(`SELECT id,experiment,base_turn FROM scenario_runs
    WHERE user_id=$1 AND base_city_id=$2 AND status='COMPLETED' ORDER BY created_at DESC,id DESC LIMIT 12`,
    [identity.userId,identity.cityId])).rows;
  return rows.map(row=>({id:cell(row,"id"),experiment:cell(row,"experiment") as Experiment,
    baseTurn:whole(row,"base_turn")}));
}
