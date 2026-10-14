import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number };
export type LucideIcon = (props: IconProps) => ReactNode;
function icon(body: ReactNode): LucideIcon {
  return function Icon({size=24,strokeWidth=2,children,...props}:IconProps) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{body}{children}</svg>;
  };
}
export const ArrowRight=icon(<><path d="M4 12h15m-6-6 6 6-6 6"/></>);
export const ChevronRight=icon(<path d="m9 5 7 7-7 7"/>);
export const ArrowDownRight=icon(<path d="M5 5 19 19m0-8v8h-8"/>);
export const ArrowUpRight=icon(<path d="M5 19 19 5m-8 0h8v8"/>);
export const Check=icon(<path d="m4 12 5 5L20 6"/>);
export const Play=icon(<path d="m7 4 13 8L7 20z"/>);
export const Clock3=icon(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>);
export const CircleHelp=icon(<><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.6 2.6 0 0 1 5.1.7c0 1.7-2.8 2.1-2.8 3.8m0 3h.01"/></>);
export const RefreshCw=icon(<><path d="M20 7V3l-3 3a8 8 0 0 0-13 5m0 6v4l3-3a8 8 0 0 0 13-5"/></>);
export const LayoutGrid=icon(<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>);
export const House=icon(<><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/></>);
export const Building2=icon(<><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M7 8V3h10v5M7 12h2m5 0h2m-9 4h2m5 0h2M11 21v-4h2v4"/></>);
export const Landmark=icon(<><path d="m2 10 10-7 10 7M3 20h18M5 11v7m5-7v7m4-7v7m5-7v7"/></>);
export const Croissant=icon(<><path d="M19 5c-1 3-3 4-5 5s-3 3-3 5-1 4-4 5c-3-1-4-3-4-6 0-5 4-10 9-11 3-1 5 0 7 2Z"/><path d="M14 10c3 0 5 1 7 3-1 3-4 6-7 7-2 1-5 1-7 0"/></>);
export const BriefcaseBusiness=icon(<><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 13h18m-11 0v2h4v-2"/></>);
export const Banknote=icon(<><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 9h1m12 6h1"/></>);
export const Wallet=icon(<><path d="M4 6h15a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11"/><path d="M16 12h6v5h-6a2 2 0 0 1 0-5Z"/></>);
export const TrendingUp=icon(<><path d="m3 17 6-6 4 3 7-8M15 6h5v5"/></>);
export const FlaskConical=icon(<><path d="M9 3h6m-5 0v7L4 20h16l-6-10V3M7 15h10"/></>);
export const Newspaper=icon(<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h5v5H7zm8 0h3m-3 4h3M7 16h11"/></>);
export const GraduationCap=icon(<><path d="m2 9 10-5 10 5-10 5zM6 12v5c4 3 8 3 12 0v-5m4-3v7"/></>);
