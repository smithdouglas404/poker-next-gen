import { HandHistoryBrowser } from "@/features/hand-history/HandHistoryBrowser";
export const metadata = { title: "Hand History — HRC" };
export default function HandHistoryPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <HandHistoryBrowser />
    </main>
  );
}
