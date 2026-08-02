import { ClubAnalytics } from "@/features/clubs/ClubAnalytics";
export const metadata = { title: "Club Analytics — HRC" };
export default function ClubAnalyticsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ClubAnalytics />
    </main>
  );
}
