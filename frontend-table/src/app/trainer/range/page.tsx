import { RangeTrainer } from "@/features/trainer/RangeTrainer";
export const metadata = { title: "Range Trainer — HRC" };
export default function RangeTrainerPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <RangeTrainer />
    </main>
  );
}
