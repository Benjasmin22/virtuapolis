"use server";

import { redirect } from "next/navigation";
import { demoContext } from "@/city/context";
import { runScenario } from "@/lab/scenarios";

const hypotheses={cost:{experiment:"BAKERY_COST",value:5000},
  credit:{experiment:"INTEREST_CREDIT",value:1000},
  budget:{experiment:"PUBLIC_BUDGET",value:"100"}} as const;

export async function simulateImpactAction(story:keyof typeof hypotheses):Promise<void> {
  if(!Object.hasOwn(hypotheses,story)) throw new Error("Hipótese indisponível.");
  const {db,identity}=await demoContext();
  const {id}=await runScenario(db,{...identity,...hypotheses[story]});
  redirect(`/lab?run=${id}`);
}
