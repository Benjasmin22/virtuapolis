"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Banknote, Croissant, Landmark, ArrowRight, FlaskConical } from "@/components/icons";
import { money, percent } from "@/lib/format";
import type { Experiment, ScenarioComparison } from "@/lab/scenarios";
import { runScenarioAction } from "./actions";

type Option={value:number|string;label:string};
const experiments:{kind:Experiment;title:string;intro:string;icon:typeof Banknote;options:Option[]}[]=[
  {kind:"INTEREST_CREDIT",title:"Juros e crédito",intro:"O Banco Horizonte empresta MQ 10,00 a uma família por uma semana. Ela quita o principal e paga juros.",icon:Banknote,
    options:[{value:0,label:"0%"},{value:500,label:"5%"},{value:1000,label:"10%"},{value:1500,label:"15%"}]},
  {kind:"BAKERY_COST",title:"Custo da padaria",intro:"Os insumos ficam mais caros. Veja o efeito no valor adicionado e no caixa da padaria.",icon:Croissant,
    options:[{value:1000,label:"+10%"},{value:2500,label:"+25%"},{value:5000,label:"+50%"}]},
  {kind:"PUBLIC_BUDGET",title:"Orçamento público",intro:"A prefeitura transfere à Família Oliveira até o valor escolhido, limitado ao imposto arrecadado.",icon:Landmark,
    options:[{value:"50",label:"Até MQ 0,50"},{value:"100",label:"Até MQ 1,00"},{value:"200",label:"Até MQ 2,00"}]},
];
const titles=Object.fromEntries(experiments.map(x=>[x.kind,x.title]));
function Delta({base,next,currency=true}:{base:string;next:string;currency?:boolean}) {
  const difference=BigInt(next)-BigInt(base);
  return <span className={`lab-delta ${difference>0n?"up":difference<0n?"down":""}`}>
    {difference===0n?"Sem mudança":`${difference>0n?"+":""}${currency?money(difference.toString()):percent(difference.toString())}`}
  </span>;
}

export default function LabWorkbench({comparison,history}:{comparison:ScenarioComparison|null;
  history:{id:string;experiment:Experiment;baseTurn:number}[]}) {
  const router=useRouter();
  const [selected,setSelected]=useState<Experiment>(comparison?.experiment??"BAKERY_COST");
  const [value,setValue]=useState<number|string>(comparison?.value??2500);
  const [pending,startTransition]=useTransition();
  const [error,setError]=useState("");
  const current=experiments.find(item=>item.kind===selected)!;
  function choose(kind:Experiment) {
    const item=experiments.find(x=>x.kind===kind)!;
    setSelected(kind);setValue(item.options[0].value);setError("");
  }
  function simulate() {
    if(pending) return;
    setError("");
    startTransition(async()=>{
      try {const id=await runScenarioAction(selected,value);router.push(`/lab?run=${id}`);}
      catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível executar a simulação.");}
    });
  }
  const rows=comparison?[
    {name:"Vendas de pão",base:comparison.base.salesCents,next:comparison.simulated.salesCents},
    {name:"Custo de insumos",base:comparison.base.inputCostsCents,next:comparison.simulated.inputCostsCents},
    {name:"PIB local",base:comparison.base.gdpCents,next:comparison.simulated.gdpCents},
    {name:"Caixa da padaria",base:comparison.base.bakeryCashCents,next:comparison.simulated.bakeryCashCents},
    {name:"Caixa da família",base:comparison.base.familyCashCents,next:comparison.simulated.familyCashCents},
    {name:"Caixa do banco",base:comparison.base.bankCashCents,next:comparison.simulated.bankCashCents},
    {name:"Caixa público",base:comparison.base.publicCashCents,next:comparison.simulated.publicCashCents},
  ]:[];
  return <div className="lab-layout">
    <section className="learning-card lab-control"><span className="learning-pill">01 · ESCOLHA O EXPERIMENTO</span>
      <div className="lab-choices" role="group" aria-label="Experimentos">
        {experiments.map(item=><button type="button" className={selected===item.kind?"active":""}
          aria-pressed={selected===item.kind} key={item.kind} onClick={()=>choose(item.kind)} disabled={pending}>
          <item.icon size={21}/><strong>{item.title}</strong><span>{item.intro}</span></button>)}
      </div>
      <h2>Defina a intensidade</h2><div className="lab-options" role="group" aria-label="Intensidade do experimento">
        {current.options.map(option=><button key={option.value} type="button" disabled={pending}
          aria-pressed={value===option.value} className={value===option.value?"active":""} onClick={()=>setValue(option.value)}>{option.label}</button>)}
      </div>
      <p className="lab-explainer">A simulação copia a estrutura e os saldos atuais, avança uma semana em cada fork e compara o mesmo horizonte. Nenhuma decisão da cidade principal é alterada.</p>
      <button className="learning-primary lab-run" type="button" disabled={pending} onClick={simulate}>
        <FlaskConical size={17}/>{pending?"Calculando dois cenários...":"Executar experimento"}<ArrowRight size={16}/></button>
      {error&&<p className="lab-error" role="alert">{error}</p>}
    </section>
    <div className="lab-results">
      {comparison?<section className="learning-card lab-comparison" aria-label="Comparação de cenários">
        <span className="learning-pill">02 · RESULTADO DA SEMANA {comparison.baseTurn+1}</span>
        <h2>{titles[comparison.experiment]}</h2>
        <p>Ambos os cenários partiram do fim da semana {comparison.baseTurn}. Diferença = simulado menos base.</p>
        <div className="lab-table-wrap"><table><thead><tr><th>Indicador</th><th>Cenário base</th><th>Simulado</th><th>Diferença</th></tr></thead>
          <tbody>{rows.map(row=><tr key={row.name}><th scope="row">{row.name}</th><td>{money(row.base)}</td><td>{money(row.next)}</td><td><Delta base={row.base} next={row.next}/></td></tr>)}</tbody></table></div>
        <div className="lab-footnotes">
          <span>Inflação do pão: {percent(comparison.base.inflationBps)} → {percent(comparison.simulated.inflationBps)}</span>
          <span>Emprego: {percent(comparison.base.employmentBps)} → {percent(comparison.simulated.employmentBps)}</span>
          {comparison.experiment==="INTEREST_CREDIT"&&<span>Crédito: {money(comparison.effects.principalCents)} · Juros pagos: {money(comparison.effects.interestCents)}</span>}
          {comparison.experiment==="PUBLIC_BUDGET"&&<span>Gasto realizado: {money(comparison.effects.publicSpendingCents)} (limitado à arrecadação)</span>}
        </div>
        <Link href="/city" className="learning-link">Voltar à cidade principal <ArrowRight size={13}/></Link>
      </section>:<section className="learning-card lab-placeholder"><FlaskConical size={35}/><h2>Seu resultado aparecerá aqui</h2>
        <p>Os dois cenários serão criados no servidor a partir da mesma semana. Selecione um experimento para ver os efeitos em MQ.</p></section>}
      {history.length>0&&<section className="learning-card lab-history"><h3>Experimentos recentes</h3><ul>{history.map(item=><li key={item.id}>
        <Link href={`/lab?run=${item.id}`}>{titles[item.experiment]} <span>· Semana {item.baseTurn+1}</span><ArrowRight size={14}/></Link></li>)}</ul></section>}
    </div>
  </div>;
}
