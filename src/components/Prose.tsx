import { Header } from "./Header";

export function Prose({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Header title={title} back="/" />
      <main className="flex-1 space-y-4 px-4 py-6 text-sm leading-relaxed text-slate-700 [&_h2]:pt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900">
        {children}
      </main>
    </>
  );
}
