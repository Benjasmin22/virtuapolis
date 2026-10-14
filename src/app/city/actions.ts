"use server";

import { revalidatePath } from "next/cache";
import { advanceWeek } from "@/engine/weekly-turn";
import { demoContext } from "@/city/context";

export async function advanceWeekAction(requestKey: string) {
  const {db,identity}=await demoContext();
  const report=await advanceWeek(db,{cityId:identity.cityId,userId:identity.userId,requestKey});
  revalidatePath("/city");
  return report;
}

export async function applyDecisionAction(input: {
  type: "BAKERY_PRICE" | "PUBLIC_TAX" | "FAMILY_BREAD";
  agentId: string;
  value: number | string;
}) {
  if (!input || typeof input.agentId !== "string" ||
    (typeof input.value === "number" && !Number.isSafeInteger(input.value))) {
    throw new Error("Decisão inválida.");
  }
  const allowed = {
    BAKERY_PRICE: ["80","100","120","140","160"],
    PUBLIC_TAX: [0,500,1000],
    FAMILY_BREAD: [6,10,14],
  } as const;
  if (!(input.type in allowed) || !allowed[input.type].some(value=>value===input.value)) {
    throw new Error("Valor de decisão fora das opções disponíveis.");
  }
  const {db,identity}=await demoContext();
  await db.transaction(async tx => {
    const city=await tx.query("SELECT id FROM cities WHERE id=$1 AND user_id=$2 FOR UPDATE",[identity.cityId,identity.userId]);
    if (city.rows.length !== 1) throw new Error("Cidade indisponível.");
    let result;
    switch (input.type) {
      case "BAKERY_PRICE":
        result=await tx.query("UPDATE companies SET price_cents=$3 WHERE id=$1 AND city_id=$2 AND kind='BAKERY' RETURNING id",
          [input.agentId,identity.cityId,input.value]);
        break;
      case "PUBLIC_TAX":
        if (input.agentId !== identity.cityId) throw new Error("Prefeitura inválida.");
        result=await tx.query("UPDATE cities SET sales_tax_bps=$2 WHERE id=$1 RETURNING id",
          [identity.cityId,input.value]);
        break;
      case "FAMILY_BREAD":
        result=await tx.query("UPDATE households SET weekly_bread_units=$3 WHERE id=$1 AND city_id=$2 RETURNING id",
          [input.agentId,identity.cityId,input.value]);
        break;
    }
    if (result.rows.length !== 1) throw new Error("Agente não pertence a Nova Aurora.");
  });
  revalidatePath("/city");
  return {success:true};
}
