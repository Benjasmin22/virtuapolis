"use server";

import { revalidatePath } from "next/cache";
import { demoContext } from "@/city/context";
import { runScenario, type Experiment } from "@/lab/scenarios";

export async function runScenarioAction(experiment:Experiment,value:number|string):Promise<string> {
  const {db,identity}=await demoContext();
  const result=await runScenario(db,{...identity,experiment,value});
  revalidatePath("/lab");
  return result.id;
}
