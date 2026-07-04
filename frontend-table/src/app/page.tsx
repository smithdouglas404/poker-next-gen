import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-neutral-950 px-6 text-center text-white">
      <div>
        <p className="text-sm uppercase tracking-[0.35em] text-amber-300/80">Poker Next-Gen</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Texas Hold&apos;em Table
        </h1>
        <p className="mt-4 max-w-md text-neutral-400">
          Open the table below. Cards deal automatically when the page loads.
        </p>
      </div>

      <Link
        href="/table"
        className="rounded-full border border-amber-400/70 bg-emerald-800 px-10 py-4 text-lg font-semibold uppercase tracking-[0.2em] text-amber-100 shadow-lg shadow-black/40 transition hover:bg-emerald-700"
      >
        Open Poker Table
      </Link>

      <p className="text-xs text-neutral-500">
        Direct link:{" "}
        <Link href="/table" className="text-emerald-400 underline">
          http://localhost:3000/table
        </Link>
      </p>
    </main>
  );
}
