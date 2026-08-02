import { TournamentDetail } from "@/features/tournaments/TournamentDetail";
export const metadata = { title: "Tournament — HRC" };
export default function TournamentDetailPage({ params }: { params: { id: string } }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <TournamentDetail id={params.id} />
    </main>
  );
}
