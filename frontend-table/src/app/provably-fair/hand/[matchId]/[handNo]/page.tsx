import { HandAuditDetail } from "@/features/audit/HandAuditDetail";

// Deep-linkable per-hand cryptographic-proof detail off /provably-fair.
// Next 15 App Router: route params arrive as a Promise and must be awaited.
export default async function HandAuditRoute({
  params,
}: {
  params: Promise<{ matchId: string; handNo: string }>;
}) {
  const { matchId, handNo } = await params;
  const parsed = Number.parseInt(handNo, 10);
  return (
    <HandAuditDetail
      matchId={decodeURIComponent(matchId)}
      handNo={Number.isFinite(parsed) ? parsed : 0}
    />
  );
}
