import LearningShell from "@/components/learning-shell";
import { demoContext } from "@/city/context";
import { getScenarioComparison, listScenarios } from "@/lab/scenarios";
import LabWorkbench from "./workbench";
import "./lab.css";

export const dynamic="force-dynamic";
export const runtime="nodejs";

export default async function LabPage({searchParams}:{searchParams:Promise<{run?:string}>}) {
  const {db,identity}=await demoContext();
  const {run}=await searchParams;
  const [history,comparison]=await Promise.all([
    listScenarios(db,identity),run?getScenarioComparison(db,identity,run):Promise.resolve(null),
  ]);
  return <LearningShell section="Laboratório">
    <div className="learning-kicker">EXPERIMENTE · COMPARE · ENTENDA</div>
    <h1>Laboratório de cenários</h1>
    <p className="learning-lede">Escolha uma mudança e veja duas versões da mesma cidade uma semana depois. Cada execução cria forks separados; Nova Aurora continua como estava.</p>
    <LabWorkbench key={comparison?.id??"new"} comparison={comparison} history={history}/>
  </LearningShell>;
}
