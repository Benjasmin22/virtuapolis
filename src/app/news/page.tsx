import LearningShell from "@/components/learning-shell";
import { ArrowRight, Newspaper } from "@/components/icons";
import { simulateImpactAction } from "./actions";
import "./news.css";

export default function NewsPage() {
  const stories=[
    {id:"cost" as const,category:"INFLAÇÃO",title:"IPCA de setembro varia 0,82%",
      date:"09/10/2026",source:"IBGE",url:"https://agenciadenoticias.ibge.gov.br/agencia-sala-de-imprensa/2013-agencia-de-noticias/releases/48246-ipca-fica-em-0-82-em-setembro",
      fact:"O IBGE divulgou variação de 0,82% no IPCA de setembro de 2026.",
      context:"O IPCA mede uma cesta de bens e serviços no Brasil. Nova Aurora tem apenas o pão como produto modelado; sua inflação interna não equivale ao IPCA.",
      hypothesis:"Para estudar um possível canal de pressão de custos, e se os insumos da padaria fictícia subirem 50%?"},
    {id:"credit" as const,category:"JUROS",title:"Copom fixa meta Selic em 13,75% ao ano",
      date:"16/09/2026",source:"Banco Central",url:"https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=45963&tipo=Comunicado",
      fact:"O comunicado do Banco Central definiu a meta da Selic em 13,75% ao ano a partir de 17 de setembro de 2026.",
      context:"A Selic é uma referência para a economia, mas não determina sozinha a taxa de um empréstimo específico. O Lab utiliza juros hipotéticos por uma semana, sem converter a Selic em taxa semanal.",
      hypothesis:"Como exercício, e se o Banco Horizonte emprestar MQ 10,00 por uma semana a juros fictícios de 10%?"},
    {id:"budget" as const,category:"CONTAS PÚBLICAS",title:"Tesouro divulga resultado de agosto",
      date:"29/09/2026",source:"Tesouro Nacional",url:"https://www.tesourotransparente.gov.br/publicacoes/boletim-resultado-do-tesouro-nacional-rtn/2026/8",
      fact:"O Governo Central registrou déficit primário de R$ 13,6 bilhões em agosto de 2026, segundo o boletim do Tesouro.",
      context:"O resultado primário compara receitas e despesas do Governo Central. A prefeitura de Nova Aurora é um modelo didático muito menor, com apenas arrecadação sobre o pão e uma transferência possível.",
      hypothesis:"Na cidade fictícia, e se a prefeitura destinar até MQ 1,00 da arrecadação da próxima semana à Família Oliveira?"},
  ];
  return <LearningShell section="News">
    <div className="learning-kicker">ECONOMIA REAL · EDIÇÃO CURADA EM 13/10/2026</div>
    <h1>News</h1>
    <p className="learning-lede">Fatos publicados por fontes oficiais, com contexto e uma hipótese para explorar na cidade fictícia. As simulações são exercícios, não previsões da economia brasileira.</p>
    <div className="news-grid">{stories.map(story=><article className="learning-card news-story" key={story.id}>
      <div className="news-meta"><Newspaper size={17}/><span>{story.category}</span><span>·</span><span>{story.date}</span></div>
      <h2>{story.title}</h2>
      <div className="news-layer"><b>01 · FATO</b><p>{story.fact}</p></div>
      <div className="news-layer"><b>02 · CONTEXTO</b><p>{story.context}</p></div>
      <div className="news-layer hypothesis"><b>03 · HIPÓTESE</b><p>{story.hypothesis}</p></div>
      <a className="news-source" href={story.url} target="_blank" rel="noopener noreferrer">Fonte: {story.source} ↗</a>
      <form action={simulateImpactAction.bind(null,story.id)}><button type="submit" className="learning-primary">Simular impacto <ArrowRight size={16}/></button></form>
    </article>)}</div>
    <p className="news-disclosure">Edição estática com datas e fontes. Os fatos não são atualizados automaticamente; confira a publicação original para informações posteriores.</p>
  </LearningShell>;
}
