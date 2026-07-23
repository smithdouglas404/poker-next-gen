import { redirect } from "next/navigation";

// The former standalone "Invitation System" screen was merged into the single
// Club Invitations surface (P0-8). Keep the old route working as a redirect.
export default function InvitationSystemPage() {
  redirect("/clubs/invite");
}
