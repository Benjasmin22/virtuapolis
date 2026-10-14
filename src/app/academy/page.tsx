import Link from "next/link";
import LearningShell from "@/components/learning-shell";
import { ArrowRight, GraduationCap } from "@/components/icons";
import "./academy.css";

const lessons=[
  {number:"01",id:"circulacao",title:"O dinheiro circula",duration:"4 min",concept:"Partidas dobradas",
    summary:"Toda compra é uma saída para alguém e uma entrada para outro agente. A mesma transferência cria um débito e um crédito de valor igual.",
    example:"Quando a Família Oliveira compra pão, seu caixa diminui e o da padaria aumenta pela mesma quantia.",
    practice:"Abra Finanças na cidade e compare uma compra no painel da família e no da padaria.",href:"/city"},
  {number:"02",id:"precos",title:"Preços mudam escolhas",duration:"5 min",concept:"Demanda e elasticidade",
    summary:"Um preço maior tende a reduzir unidades procuradas. O motor limita a resposta pelo parâmetro de elasticidade, pela capacidade e pelo dinheiro disponível.",
    example:"Aumentar o preço do pão pode elevar receita por unidade e, ao mesmo tempo, diminuir a quantidade vendida.",
    practice:"Ajuste o preço na Padaria Aurora, avance uma semana e observe vendas e PIB local.",href:"/city"},
  {number:"03",id:"credito",title:"Crédito tem custo",duration:"5 min",concept:"Principal e juros",
    summary:"Um empréstimo transfere recursos temporariamente. O principal retorna ao banco; os juros são uma transferência adicional da família ao banco.",
    example:"Um crédito de MQ 10,00 a 10% por uma semana exige MQ 10,00 de principal e MQ 1,00 de juros.",
    practice:"Compare as opções de juros no experimento de crédito do Lab.",href:"/lab"},
  {number:"04",id:"estado",title:"O orçamento tem limites",duration:"4 min",concept:"Arrecadação e gasto",
    summary:"Impostos entram no caixa público. Uma transferência exige recursos disponíveis e muda o saldo do tesouro e do beneficiário.",
    example:"Se a semana arrecadar menos que MQ 1,00, a prefeitura só conseguirá transferir o valor arrecadado no cenário.",
    practice:"Abra o experimento de orçamento público e compare os dois caixas.",href:"/lab"},
  {number:"05",id:"cenarios",title:"Comparar cenários",duration:"6 min",concept:"Experimento controlado",
    summary:"Para atribuir uma diferença à decisão, os dois cenários devem começar do mesmo estado e percorrer o mesmo tempo.",
    example:"O Lab tira dois retratos dos saldos e agentes atuais, muda apenas um parâmetro e avança uma semana em cada cópia.",
    practice:"No Lab, compare custo de insumos, PIB local e caixa da padaria após um choque.",href:"/lab"},
];

export default function AcademyPage() {
  return <LearningShell section="Academy">
    <div className="learning-kicker">TRILHA DE APRENDIZAGEM · 5 LIÇÕES</div>
    <h1>Academy</h1>
    <p className="learning-lede">Uma trilha curta para ler os números da cidade. Siga a ordem ou abra a lição que ajude a entender sua próxima decisão.</p>
    <div className="academy-layout"><nav className="learning-card academy-steps" aria-label="Lições da trilha">
      <div className="academy-icon"><GraduationCap size={25}/></div><h2>Sua trilha</h2><p>Da compra de pão à comparação de cenários.</p>
      <ol>{lessons.map(item=><li key={item.id}><a href={`#${item.id}`}><span>{item.number}</span><strong>{item.title}</strong><small>{item.duration}</small></a></li>)}</ol>
    </nav><div className="academy-lessons">{lessons.map(item=><article id={item.id} key={item.id} className="learning-card academy-lesson">
      <div className="academy-lesson-meta"><span>LIÇÃO {item.number}</span><span>{item.duration}</span></div>
      <h2>{item.title}</h2><span className="learning-pill">{item.concept}</span>
      <p>{item.summary}</p><div className="academy-example"><strong>NA CIDADE</strong><p>{item.example}</p></div>
      <div className="academy-practice"><div><strong>EXPERIMENTE</strong><p>{item.practice}</p></div>
        <Link className="learning-link" href={item.href}>Abrir {item.href==="/lab"?"Lab":"Cidade"} <ArrowRight size={14}/></Link></div>
    </article>)}</div></div>
  </LearningShell>;
}
