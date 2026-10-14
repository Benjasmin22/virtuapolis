import Link from "next/link";
import { FlaskConical, GraduationCap, LayoutGrid, Newspaper, ChevronRight } from "./icons";
import "./learning-shell.css";

const routes=[
  {href:"/city",label:"Cidade",icon:LayoutGrid},
  {href:"/lab",label:"Laboratório",icon:FlaskConical},
  {href:"/news",label:"News",icon:Newspaper},
  {href:"/academy",label:"Academy",icon:GraduationCap},
];
export default function LearningShell({section,children}:{section:string;children:React.ReactNode}) {
  return <div className="learning-shell">
    <aside className="learning-sidebar"><Link className="learning-brand" href="/city"><span className="learning-logo">◈</span><span><strong>virtuapolis</strong><small>ENTENDA A ECONOMIA</small></span></Link>
      <span className="learning-nav-label">EXPLORAR</span><nav aria-label="Navegação principal">
        {routes.map(route=><Link key={route.href} href={route.href} aria-current={section===route.label?"page":undefined}
          className={section===route.label?"selected":""}><route.icon size={19}/><span>{route.label}</span>{section===route.label&&<ChevronRight size={15}/>}</Link>)}
      </nav><div className="learning-side-note"><span>V1 FOUNDATION</span><p>Uma cidade para entender escolhas e consequências.</p></div>
    </aside>
    <main className="learning-main">{children}</main>
  </div>;
}
