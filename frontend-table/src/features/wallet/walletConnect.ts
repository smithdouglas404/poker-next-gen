// Web3 wallet-connection layer for the Cashier's "Connect a Wallet" surface
// (master: detailed_private_table_setup_27 — Premium Wallet Connection Interface).
//
// Connecting an external browser wallet (MetaMask / Coinbase / WalletConnect /
// Phantom) is inherently a *client-side* action against an injected provider —
// there is no server RPC that "links" a browser wallet. What the connected
// wallet then drives IS wired to real RPCs: deposits go through
// wallet_deposit_crypto and payouts through wallet_withdraw, with balances read
// from wallet_get / wallet_balances. When no injected provider is present
// (guest / offline / no extension) we demo-populate a plausible address and flag
// it so the connected state is never presented as a real on-chain link.

export type WalletProviderId = "metamask" | "coinbase" | "walletconnect" | "phantom";

export type WalletChain = "EVM" | "Solana";

export interface WalletProviderDef {
  id: WalletProviderId;
  name: string;
  chain: WalletChain;
  /** Brand mark color — logos keep their own identity, exempt from the palette. */
  brand: string;
  /** Default payout rail passed to wallet_withdraw for this wallet's coin. */
  payoutCurrency: string;
  tagline: string;
}

export const WALLET_PROVIDERS: WalletProviderDef[] = [
  {
    id: "metamask",
    name: "MetaMask",
    chain: "EVM",
    brand: "#f6851b",
    payoutCurrency: "eth",
    tagline: "Ethereum · EVM",
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    chain: "EVM",
    brand: "#0052ff",
    payoutCurrency: "eth",
    tagline: "Ethereum · Base",
  },
  {
    id: "walletconnect",
    name: "WalletConnect",
    chain: "EVM",
    brand: "#3b99fc",
    payoutCurrency: "usdttrc20",
    tagline: "300+ mobile wallets",
  },
  {
    id: "phantom",
    name: "Phantom",
    chain: "Solana",
    brand: "#ab9ff2",
    payoutCurrency: "ltc",
    tagline: "Solana · SOL",
  },
];

export function providerDef(id: WalletProviderId): WalletProviderDef {
  return WALLET_PROVIDERS.find((p) => p.id === id) ?? WALLET_PROVIDERS[0];
}

// ---- injected-provider access (typed, no `any`) --------------------------

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
}

interface PhantomSolana {
  connect(): Promise<{ publicKey: { toString(): string } }>;
  isPhantom?: boolean;
}

interface InjectedWindow {
  ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
  phantom?: { solana?: PhantomSolana };
}

function injected(): InjectedWindow {
  if (typeof window === "undefined") return {};
  return window as unknown as InjectedWindow;
}

function pickEvmProvider(id: WalletProviderId): Eip1193Provider | null {
  const eth = injected().ethereum;
  if (!eth) return null;
  const list = eth.providers ?? [eth];
  if (id === "metamask") return list.find((p) => p.isMetaMask) ?? eth;
  if (id === "coinbase") return list.find((p) => p.isCoinbaseWallet) ?? eth;
  return eth; // walletconnect has no injected flag — reuse the default provider
}

// ---- demo address synthesis (offline / no extension) ---------------------

const HEX = "0123456789abcdef";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function randBytes(n: number): number[] {
  const out = new Array<number>(n);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint8Array(n);
    crypto.getRandomValues(buf);
    for (let i = 0; i < n; i++) out[i] = buf[i];
  } else {
    for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

function demoAddress(chain: WalletChain): string {
  const bytes = randBytes(chain === "EVM" ? 20 : 32);
  if (chain === "EVM") {
    return "0x" + bytes.map((b) => HEX[(b >> 4) & 0xf] + HEX[b & 0xf]).join("");
  }
  // Solana-style base58, ~44 chars.
  return bytes.map((b) => B58[b % B58.length]).join("") + B58[bytes[0] % B58.length];
}

export interface ConnectOutcome {
  address: string;
  /** true when synthesized offline — never treat as a real on-chain link. */
  demo: boolean;
}

/** Connect to an external wallet. Uses the injected provider when present,
 *  otherwise demo-populates a plausible address for the offline showcase. */
export async function connectWallet(id: WalletProviderId): Promise<ConnectOutcome> {
  const def = providerDef(id);
  try {
    if (def.chain === "Solana") {
      const sol = injected().phantom?.solana;
      if (sol?.connect) {
        const res = await sol.connect();
        const addr = res.publicKey.toString();
        if (addr) return { address: addr, demo: false };
      }
    } else {
      const prov = pickEvmProvider(id);
      if (prov) {
        const accounts = (await prov.request({ method: "eth_requestAccounts" })) as unknown;
        if (Array.isArray(accounts) && typeof accounts[0] === "string" && accounts[0]) {
          return { address: accounts[0], demo: false };
        }
      }
    }
  } catch {
    // user rejected, or provider threw — fall through to demo populate
  }
  return { address: demoAddress(def.chain), demo: true };
}

// ---- persistence (per-device linked wallets) -----------------------------

const STORAGE_KEY = "poker.wallet.connect.v1";

export interface StoredConnection {
  address: string;
  demo: boolean;
  connectedAt: number;
}

export type ConnectionMap = Partial<Record<WalletProviderId, StoredConnection>>;

export function loadConnections(): ConnectionMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ConnectionMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveConnection(id: WalletProviderId, conn: StoredConnection): ConnectionMap {
  const map = loadConnections();
  map[id] = conn;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage disabled — connection is still live for this session */
  }
  return map;
}

export function removeConnection(id: WalletProviderId): ConnectionMap {
  const map = loadConnections();
  delete map[id];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
  return map;
}

/** Middle-truncate an address for display: 0x1234… abCd. */
export function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
