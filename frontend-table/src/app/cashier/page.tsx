import { CashierWizard } from "@/features/cashier/CashierWizard";
export const metadata = { title: "Cashier — HRC" };
export default function CashierPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <CashierWizard />
    </main>
  );
}
