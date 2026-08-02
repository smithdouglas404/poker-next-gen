import { SocialFeed } from "@/features/social/SocialFeed";
export const metadata = { title: "Social Hub — HRC" };
export default function SocialPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <SocialFeed />
    </main>
  );
}
