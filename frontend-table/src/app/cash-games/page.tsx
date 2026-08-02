import { TableFinder } from "@/features/cash-games/TableFinder";
export const metadata = { title: "Cash Games — HRC" };
export default function CashGamesPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <TableFinder />
    </main>
  );
}
