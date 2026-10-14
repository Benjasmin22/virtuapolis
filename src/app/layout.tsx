import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Virtuapolis — Nova Aurora",
  description: "Explore a cidade e acompanhe como suas decisões movimentam a economia.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
