"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Banknote, BriefcaseBusiness,
  Building2, Check, ChevronRight, CircleHelp, Clock3, Croissant, FlaskConical,
  GraduationCap, House, Landmark, LayoutGrid, Newspaper, Play, RefreshCw,
  TrendingUp, Wallet, type LucideIcon,
} from "@/components/icons";
import type { CityBuilding, CityView } from "@/city/projection";
import { advanceWeekAction, applyDecisionAction } from "./actions";

type Tab = "overview" | "finances" | "decisions";
const icons: Record<CityBuilding["kind"],LucideIcon> = {
  RESIDENCE:House, BAKERY:Croissant, BANK:Building2, CITY_HALL:Landmark,
};
const categories: Record<CityBuilding["kind"],string> = {
  RESIDENCE:"Família", BAKERY:"Empresa", BANK:"Instituição financeira", CITY_HALL:"Setor público",
};
const labels: Record<string,string> = {
  WAGE:"Salário", PURCHASE:"Compra de pães", TRANSFER:"Insumos da padaria",
  TAX:"Imposto sobre vendas", OPENING:"Saldo inicial", LOAN:"Crédito", REPAYMENT:"Pagamento", INTEREST:"Juros",
};

function money(cents: string) {
  const value=BigInt(cents);
  const sign=value<0n ? "−" : "";
  const absolute=value<0n ? -value : value;
  return `${sign}MQ ${(absolute/100n).toLocaleString("pt-BR")},${(absolute%100n).toString().padStart(2,"0")}`;
}
function percentage(bps: string) {
  const value=BigInt(bps);
  const sign=value<0n ? "−" : "";
  const absolute=value<0n ? -value : value;
  return `${sign}${(absolute/100n).toLocaleString("pt-BR")},${(absolute%100n).toString().padStart(2,"0")}%`;
}

function Metric({title,value,hint,icon:Icon,tone}:{title:string;value:string;hint:string;icon:LucideIcon;tone:string}) {
  return <article className={`metric-card tone-${tone}`}>
    <div className="metric-top"><span>{title}</span><span className="metric-icon"><Icon size={18} strokeWidth={1.8}/></span></div>
    <strong>{value}</strong><small>{hint}</small>
  </article>;
}

function BuildingTile({building,active,onSelect}:{building:CityBuilding;active:boolean;onSelect:()=>void}) {
  const Icon=icons[building.kind];
  return <button type="button" onClick={onSelect}
    className={`building-tile kind-${building.kind.toLowerCase()} ${active?"is-active":""}`}
    style={{gridColumn:building.x+1,gridRow:building.y+1}}
    aria-label={`Abrir ${building.name}`} aria-pressed={active}>
    <span className="building-illustration"><Icon size={31} strokeWidth={1.7}/></span>
    <span className="building-label">{building.name}</span>
    <span className="building-type">{categories[building.kind]}</span>
  </button>;
}

function AgentPanel({building,city,onDecision,pending}:{building:CityBuilding;city:CityView;
  onDecision:(type:"BAKERY_PRICE"|"PUBLIC_TAX"|"FAMILY_BREAD",value:number|string)=>void;pending:boolean}) {
  const [tab,setTab]=useState<Tab>("overview");
  const Icon=icons[building.kind];
  const heading=building.kind==="CITY_HALL" ? "Prefeitura de Nova Aurora" : building.name;
  const options=building.kind==="BAKERY" ? [80,100,120,140,160]
    : building.kind==="CITY_HALL" ? [0,500,1000]
      : building.kind==="RESIDENCE" ? [6,10,14] : [];
  const selectedValue=building.kind==="BAKERY" ? building.priceCents
    : building.kind==="CITY_HALL" ? city.salesTaxBps
      : String(building.weeklyBreadUnits??0);
  const choiceType=building.kind==="BAKERY" ? "BAKERY_PRICE"
    : building.kind==="CITY_HALL" ? "PUBLIC_TAX" : "FAMILY_BREAD";
  const optionLabel=(value:number)=>building.kind==="BAKERY" ? money(String(value))
    : building.kind==="CITY_HALL" ? percentage(String(value)) : `${value} pães`;
  return <aside className="agent-panel" aria-label={`Painel de ${heading}`}>
    <div className="panel-head">
      <div className={`panel-avatar kind-${building.kind.toLowerCase()}`}><Icon size={27} strokeWidth={1.7}/></div>
      <div><span className="eyebrow">{categories[building.kind]}</span><h2>{heading}</h2></div>
    </div>
    <nav className="panel-tabs" aria-label="Seções do agente">
      {([["overview","Visão geral"],["finances","Finanças"],["decisions","Decisões"]] as const).map(([key,label])=>
        <button type="button" key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}
          aria-current={tab===key?"page":undefined}>{label}</button>)}
    </nav>
    <div className="panel-content" key={`${building.id}-${tab}`}>
      {tab==="overview" && <>
        <div className="info-banner"><span className="info-dot"/>
          {building.kind==="RESIDENCE" ? "As famílias trabalham, recebem renda e consomem na cidade."
            : building.kind==="BAKERY" ? "A padaria transforma insumos e trabalho em produtos para a cidade."
              : building.kind==="BANK" ? "O banco guarda recursos. O crédito chega nos próximos experimentos."
                : "A prefeitura recebe tributos e acompanha os serviços coletivos."}
        </div>
        <div className="detail-list">
          {building.kind==="RESIDENCE" && <>
            <Detail label="Moradores" value={`${building.members} pessoas`}/>
            <Detail label="Em idade de trabalhar" value={`${building.workingAgeMembers} pessoas`}/>
            <Detail label="Com trabalho" value={`${building.workers} pessoa${building.workers===1?"":"s"}`}/>
            <Detail label="Demanda semanal base" value={`${building.weeklyBreadUnits} pães`}/>
          </>}
          {building.kind==="BAKERY" && <>
            <Detail label="Preço por pão" value={money(building.priceCents??"0")}/>
            <Detail label="Custo do insumo" value={money(building.unitCostCents??"0")}/>
            <Detail label="Empregados" value={`${building.employees} pessoas`}/>
            <Detail label="Vendas na última semana" value={`${city.latestReport?.breadUnits??0} pães`}/>
          </>}
          {building.kind==="BANK" && <>
            <Detail label="Caixa disponível" value={money(building.cashCents)}/>
            <Detail label="Atividade de crédito" value="Em preparação"/>
          </>}
          {building.kind==="CITY_HALL" && <>
            <Detail label="Alíquota sobre vendas" value={percentage(city.salesTaxBps)}/>
            <Detail label="Arrecadação da semana" value={money(city.latestReport?.taxesCents??"0")}/>
          </>}
        </div>
      </>}
      {tab==="finances" && <>
        <div className="balance-box"><span>Saldo disponível</span><strong>{money(building.cashCents)}</strong><small>Moeda da Virtuapolis · MQ</small></div>
        <div className="flow-cards">
          <div><ArrowDownRight size={16}/><span>Entradas</span><strong>{money(building.earnedCents)}</strong></div>
          <div><ArrowUpRight size={16}/><span>Saídas</span><strong>{money(building.spentCents)}</strong></div>
        </div>
        <h3 className="panel-subtitle">Movimentos da semana {city.turn}</h3>
        {building.activity.length ? <ul className="activity-list">
          {building.activity.map((entry,index)=><li key={`${entry.eventKey}-${entry.side}-${index}`}>
            <span className={entry.side==="DEBIT"?"entry-icon in":"entry-icon out"}>
              {entry.side==="DEBIT"?<ArrowDownRight size={17}/>:<ArrowUpRight size={17}/>}</span>
            <span><strong>{labels[entry.nature]??entry.nature}</strong><small>{entry.side==="DEBIT"?"Entrada":"Saída"}</small></span>
            <b>{entry.side==="DEBIT"?"+":"−"}{money(entry.amountCents)}</b>
          </li>)}
        </ul> : <p className="quiet-empty">Ainda não houve movimentos nesta semana.</p>}
      </>}
      {tab==="decisions" && <>
        {options.length ? <>
          <p className="decision-intro">{building.kind==="BAKERY" ? "Defina o preço do pão. A demanda reage quando a semana avançar."
            : building.kind==="CITY_HALL" ? "Escolha a alíquota do imposto sobre as vendas da padaria."
              : "Ajuste a quantidade de pães que a família procura por semana."}</p>
          <div className="choice-grid" role="group" aria-label={`Opções para ${heading}`}>
            {options.map(value=><button type="button" key={value} disabled={pending}
              aria-pressed={selectedValue===String(value)} className={selectedValue===String(value)?"chosen":""}
              onClick={()=>onDecision(choiceType,choiceType==="BAKERY_PRICE"?String(value):value)}>
              {optionLabel(value)}{selectedValue===String(value)&&<Check size={15}/>}</button>)}
          </div>
          <div className="decision-note"><Clock3 size={17}/> A decisão entra no cálculo ao avançar a próxima semana.</div>
        </> : <div className="quiet-empty">As decisões de juros e crédito estarão no Lab.</div>}
      </>}
    </div>
    <div className="panel-foot"><span className="live-dot"/> Dados da semana {city.turn} <span>·</span> Nova Aurora</div>
  </aside>;
}

function Detail({label,value}:{label:string;value:string}) {
  return <div className="detail-row"><span>{label}</span><strong>{value}</strong></div>;
}

export default function CityDashboard({city}:{city:CityView}) {
  const router=useRouter();
  const [selectedId,setSelectedId]=useState<string>(city.buildings.find(b=>b.kind==="BAKERY")?.id??city.buildings[0]?.id??"");
  const [pending,startTransition]=useTransition();
  const [notice,setNotice]=useState<{text:string;error:boolean}|null>(null);
  const requestKey=useRef<string|null>(null);
  const selected=city.buildings.find(b=>b.id===selectedId)??city.buildings[0];

  const advance=()=>{
    if (pending) return;
    requestKey.current ??= crypto.randomUUID();
    const key=requestKey.current;
    startTransition(async()=>{
      try {
        const report=await advanceWeekAction(key);
        requestKey.current=null;
        setNotice({text:`Semana ${report.turn} concluída · ${report.breadUnits} pães vendidos.`,error:false});
        router.refresh();
      } catch(error) {
        setNotice({text:error instanceof Error?error.message:"Não foi possível avançar a semana. Tente novamente.",error:true});
      }
    });
  };
  const decision=(type:"BAKERY_PRICE"|"PUBLIC_TAX"|"FAMILY_BREAD",value:number|string)=>{
    if (pending||!selected) return;
    startTransition(async()=>{
      try {
        await applyDecisionAction({type,agentId:type==="PUBLIC_TAX"?city.id:selected.agentId??"",value});
        setNotice({text:"Decisão registrada. Avance a semana para observar o efeito.",error:false});
        router.refresh();
      } catch(error) {
        setNotice({text:error instanceof Error?error.message:"Não foi possível registrar a decisão.",error:true});
      }
    });
  };

  return <div className="city-shell">
    <aside className="main-sidebar" aria-label="Navegação principal">
      <a href="/city" className="brand"><span className="brand-symbol"><span/><span/><span/><span/></span>
        <span><strong>virtuapolis</strong><small>ENTENDA A ECONOMIA</small></span></a>
      <div className="nav-label">EXPLORAR</div>
      <nav className="main-nav">
        <a href="/city" className="active" aria-current="page"><LayoutGrid size={20}/> Cidade <ChevronRight size={16}/></a>
        <a href="/lab"><FlaskConical size={20}/> Laboratório</a>
        <a href="/news"><Newspaper size={20}/> News</a>
        <a href="/academy"><GraduationCap size={20}/> Academy</a>
      </nav>
      <div className="sidebar-lower"><div className="sidebar-brief"><span className="sidebar-brief-icon"><CircleHelp size={20}/></span>
        <strong>Uma cidade para aprender</strong><p>Clique nos agentes e acompanhe como uma escolha circula pela economia.</p></div>
        <div className="sidebar-user"><span className="user-avatar">V</span><span><strong>Explorador</strong><small>Modo demonstração</small></span></div>
      </div>
    </aside>

    <main className="dashboard-main">
      <div className="top-line"><div><span className="crumb">EXPLORAR <ChevronRight size={13}/> CIDADE</span>
        <h1>Nova Aurora <span className="city-live"><span/> AO VIVO</span></h1></div>
        <div className="top-actions"><span className="week-label"><Clock3 size={16}/> SEMANA {city.turn}</span>
          <button type="button" className="advance-button" disabled={pending} onClick={advance}>
            {pending?<RefreshCw size={17} className="spinning"/>:<Play size={17} fill="currentColor"/>}
            {pending?"Calculando...":"Avançar semana"}<ArrowRight size={18}/></button></div>
      </div>
      {notice&&<div className={`notice ${notice.error?"notice-error":""}`} role={notice.error?"alert":"status"}>
        {notice.error?<CircleHelp size={17}/>:<Check size={17}/>}<span>{notice.text}</span>
        <button type="button" onClick={()=>setNotice(null)} aria-label="Dispensar aviso">×</button></div>}
      <section className="intro-line"><p>Uma cidade. Mil conexões. <strong>Observe o que muda a cada decisão.</strong></p>
        <span><span className="live-dot"/> Economia em funcionamento</span></section>
      <section className="metric-grid" aria-label="Indicadores macroeconômicos">
        <Metric title="Inflação interna" value={percentage(city.indicators.inflationBps)} hint="Preço do pão vs. referência" icon={TrendingUp} tone="peach"/>
        <Metric title="Emprego" value={percentage(city.indicators.employmentBps)} hint="Pessoas ocupadas / idade ativa" icon={BriefcaseBusiness} tone="blue"/>
        <Metric title="PIB local" value={money(city.indicators.gdpCents)} hint={city.turn===0?"Aguardando a primeira semana":"Valor adicionado nesta semana"} icon={Banknote} tone="purple"/>
        <Metric title="Caixa público" value={money(city.indicators.publicCashCents)} hint="Saldo da prefeitura" icon={Wallet} tone="mint"/>
      </section>

      <div className="dashboard-columns">
        <div className="left-column">
          <section className="map-card" aria-label="Mapa interativo de Nova Aurora">
            <header className="card-heading"><div><span className="eyebrow">EXPLORE A CIDADE</span>
              <h2>O mapa de Nova Aurora</h2><p>Escolha um agente para entender seu papel na economia.</p></div>
              <span className="map-view"><span className="live-dot"/> Vista da cidade</span></header>
            <div className="map-scroll"><div className="city-map">
              <span className="map-road horizontal"/><span className="map-road vertical"/>
              <span className="map-green green-one"/><span className="map-green green-two"/>
              <span className="map-label map-label-park">PARQUE CENTRAL</span>
              {city.buildings.map(building=><BuildingTile key={building.id} building={building}
                active={building.id===selected?.id} onSelect={()=>setSelectedId(building.id)}/>)}
            </div></div>
            <footer className="map-legend"><span><i className="legend-family"/> Famílias</span>
              <span><i className="legend-business"/> Empresas</span><span><i className="legend-public"/> Poder público</span>
              <small>Clique nos edifícios para explorar <ArrowRight size={14}/></small></footer>
          </section>
          <section className="story-card"><div className="story-icon"><TrendingUp size={22}/></div>
            <div><strong>Como a economia se movimenta?</strong>
              <p>Salários chegam às famílias. Compras geram receita. A padaria paga insumos e impostos. Cada movimento aparece no caixa de alguém.</p></div>
            <ChevronRight size={20}/></section>
        </div>
        {selected&&<AgentPanel building={selected} city={city} onDecision={decision} pending={pending}/>}
      </div>
      <footer className="dashboard-footer">VIRTUAPOLIS <span>·</span> UMA CIDADE PARA ENTENDER O MUNDO <span>·</span> V1 FOUNDATION</footer>
    </main>
  </div>;
}
