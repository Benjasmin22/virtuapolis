import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export default function Home() {
  if (process.env.VIRTUAPOLIS_DEMO === "1") redirect("/city");
  return <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
    <p className="mb-5 text-sm font-semibold uppercase tracking-widest text-primary">Virtuapolis / V1</p>
    <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Toda escolha faz parte de uma economia.</h1>
    <p className="mt-6 max-w-xl text-lg leading-relaxed">Nova Aurora já está pronta para exploração local. Ative o modo demonstração para abrir a cidade.</p>
  </main>;
}
