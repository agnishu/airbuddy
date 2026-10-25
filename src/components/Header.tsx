import Link from "next/link";

export function Header({ title, back }: { title: string; back?: string }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
      {back && (
        <Link href={back} aria-label="Back" className="-ml-1 rounded-lg p-1 text-slate-600 hover:bg-slate-100">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
      )}
      <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>
      {!back && (
        <Link href="/profile" className="text-sm font-medium text-sky-700">
          Profile
        </Link>
      )}
    </header>
  );
}
