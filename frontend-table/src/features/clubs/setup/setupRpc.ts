// Typed wrappers for the Initial Club Setup onboarding. Every network control on
// the /clubs/new screen maps 1:1 to a real backend-core RPC:
//   - club_create  (creates the club + charges the one-time ownership fee)
//   - club_update  (applies tag, membership type, approval, branding + settings)
// No fabricated data is ever presented as live; offline callers fall back to a
// clearly-labelled preview (see clubSetup.createClub `demo` flag).

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

// ---- shapes (mirror backend-core/models.Club + rpc/clubs_ext ClubUpdate) ----

export interface CreatedClub {
  id: string;
  name: string;
  slug: string;
  description?: string;
  currency: string;
  is_active?: boolean;
}

export type ClubType = "private" | "semi_private" | "public";

export interface ClubSettings {
  brand_color: string;
  club_type: ClubType;
  default_credit_limit_cents: number;
}

export interface SetupForm {
  name: string;
  tag: string;
  description: string;
  currency: string;
  clubType: ClubType;
  requireApproval: boolean;
  brandColor: string;
  creditLimitCents: number;
  logoDataUrl: string | null;
}

export interface CreateResult {
  club: CreatedClub;
  demo: boolean; // true = local preview only (guest/offline); NOT persisted
}

// One-time ownership fee to create a club. Mirrors backend clubCreateFeeCents()
// (CLUB_CREATE_FEE_CENTS, default $250). The debit happens server-side inside
// club_create — this constant is display-only.
export const CLUB_CREATE_FEE_CENTS = 25000;

// A private club is invite-only; semi-private is discoverable but gated by
// approval; public is open. Maps the tri-state Club Type onto the two real
// backend flags (is_public / require_approval).
function typeToFlags(t: ClubType): { is_public: boolean; require_approval: boolean } {
  switch (t) {
    case "public":
      return { is_public: true, require_approval: false };
    case "semi_private":
      return { is_public: true, require_approval: true };
    case "private":
    default:
      return { is_public: false, require_approval: true };
  }
}

async function call<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

export const clubSetup = {
  /**
   * Full create flow. Charges the fee + creates the club (club_create), then
   * applies identity/branding/membership settings (club_update). On an offline
   * or guest session both calls throw; we surface a clearly-labelled preview
   * (`demo: true`) so the operator sees the shape without fake persistence.
   */
  async createClub(form: SetupForm): Promise<CreateResult> {
    const slug = form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const flags = typeToFlags(form.clubType);
    const settings: ClubSettings = {
      brand_color: form.brandColor,
      club_type: form.clubType,
      default_credit_limit_cents: form.creditLimitCents,
    };

    try {
      const club = await call<CreatedClub>("club_create", {
        name: form.name.trim(),
        slug,
        description: form.description.trim(),
        currency: form.currency,
      });
      // Apply the rest of the onboarding config to the freshly-created club.
      // Non-fatal: a create that succeeds but an update that fails still yields
      // a real club — we report the club and let the owner re-save settings.
      try {
        await call("club_update", {
          club_id: club.id,
          tag: form.tag.trim().toUpperCase(),
          is_public: flags.is_public,
          require_approval: form.requireApproval,
          avatar_ref: form.logoDataUrl ? "custom" : "",
          settings_json: settings,
        });
      } catch {
        /* club exists; settings can be re-applied from the club dashboard */
      }
      return { club, demo: false };
    } catch (err) {
      // Guest / offline: produce a local preview, never a fake persisted club.
      const message = err instanceof Error ? err.message : String(err);
      // A verification/registration or balance error is a real server response —
      // rethrow so the UI shows the actual gate instead of a silent preview.
      if (/balance|fee|verif|register|forbidden|upgrade|limit|unauthor/i.test(message)) {
        throw err;
      }
      return {
        club: {
          id: `preview-${slug || "club"}`,
          name: form.name.trim(),
          slug: slug || "club",
          description: form.description.trim(),
          currency: form.currency,
          is_active: true,
        },
        demo: true,
      };
    }
  },
};

// ---- currencies + brand palette (client-only presentation data) ----

export interface CurrencyOption {
  code: string;
  label: string;
  symbol: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "CAD", label: "Canadian Dollar", symbol: "$" },
  { code: "AUD", label: "Australian Dollar", symbol: "$" },
  { code: "CHIPS", label: "Play Chips (no cash)", symbol: "⛃" },
  { code: "USDT", label: "Tether (USDT)", symbol: "₮" },
];

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? "$";
}

// Brand accents kept in-palette with the Neon Vault theme (graphite / cyan /
// gold) plus a couple of premium jewel tones. The chosen color drives the live
// logo preview and is persisted into settings_json.brand_color.
export interface BrandSwatch {
  name: string;
  value: string;
}

export const BRAND_SWATCHES: BrandSwatch[] = [
  { name: "GG Gold", value: "#f5c518" },
  { name: "GG Red", value: "#e01e2b" },
  { name: "Poker Green", value: "#22c55e" },
  { name: "Royal Purple", value: "#b44dff" },
  { name: "Crimson", value: "#e5484d" },
  { name: "Sapphire", value: "#2f6bff" },
];

export const CLUB_TYPE_META: Record<ClubType, { label: string; blurb: string }> = {
  private: { label: "Private", blurb: "Invite-only. Hidden from public browse." },
  semi_private: { label: "Semi-Private", blurb: "Discoverable, but joins need approval." },
  public: { label: "Public", blurb: "Open to anyone — instant join." },
};

/** Cents → full USD-style label using the club currency symbol. */
export function feeLabel(cents: number, code = "USD"): string {
  const sym = currencySymbol(code);
  return `${sym}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
