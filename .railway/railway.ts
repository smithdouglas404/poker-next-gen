import { defineRailway, github, group, postgres, project, service } from "railway/iac";

/**
 * Single Railway config for the entire poker-next-gen stack.
 *
 * Railway does not support one root railway.json for a multi-service project.
 * Use Infrastructure as Code: this file + `railway config apply`.
 *
 * Docs: https://docs.railway.com/infrastructure-as-code
 */
const REPO = "smithdouglas404/poker-next-gen";

export default defineRailway(() => {
  const db = postgres("postgres");

  const engineMath = service("engine-math", {
    source: github(REPO, { rootDirectory: "engine-math" }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
      watchPatterns: ["engine-math/**"],
    },
    healthcheck: "/health",
    healthcheckTimeout: 300,
    deploy: {
      restartPolicyType: "ON_FAILURE",
    },
  });

  const backendCore = service("backend-core", {
    source: github(REPO, { rootDirectory: "backend-core" }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
      watchPatterns: ["backend-core/**"],
    },
    healthcheck: "/healthcheck",
    healthcheckTimeout: 300,
    deploy: {
      restartPolicyType: "ALWAYS",
    },
    env: {
      DATABASE_ADDRESS: db.env.DATABASE_URL,
      PGHOST: db.env.PGHOST,
      PGPORT: db.env.PGPORT,
      PGUSER: db.env.PGUSER,
      PGPASSWORD: db.env.PGPASSWORD,
      PGDATABASE: db.env.PGDATABASE,
      ENGINE_MATH_URL: "http://engine-math.railway.internal:8080",
      NAKAMA_LOG_LEVEL: "INFO",

      // ── Billing (membership + wallet deposits) ──────────────────────────
      // Derivable values are wired here. The SECRETS below must be set in the
      // Railway dashboard on the backend-core service (never commit secrets):
      //   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
      //   NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET, ADMIN_USER_IDS
      // Until they are set, billing stays dormant (checkout/deposit report
      // "not configured"). See docs/MEMBERSHIP-BILLING.md.
      //
      // ── Identity / KYC (Didit) ──────────────────────────────────────────
      // Set on backend-core (verification) AND frontend-table (webhook receiver):
      //   DIDIT_API_KEY, DIDIT_WEBHOOK_SECRET, KYC_APPLY_SECRET,
      //   DIDIT_WORKFLOW_BASIC, DIDIT_WORKFLOW_STANDARD,
      //   DIDIT_WORKFLOW_FULL, DIDIT_WORKFLOW_ENHANCED
      // (optional: DIDIT_BASE_URL, DIDIT_SESSION_PATH). Configure the Didit
      // webhook to POST https://${{frontend-table.RAILWAY_PUBLIC_DOMAIN}}/api/kyc/webhook
      // Until DIDIT_API_KEY is set, KYC stays dormant (kyc_start reports "not
      // enabled yet"). See docs/KYC-DIDIT.md.
      APP_BASE_URL: "https://${{frontend-table.RAILWAY_PUBLIC_DOMAIN}}",
      NOWPAYMENTS_IPN_CALLBACK_URL:
        "https://${{backend-core.RAILWAY_PUBLIC_DOMAIN}}/v2/rpc/nowpayments_webhook?http_key=defaulthttpkey&unwrap",
    },
  });

  const frontendTable = service("frontend-table", {
    source: github(REPO, { rootDirectory: "frontend-table" }),
    build: {
      builder: "RAILPACK",
      buildCommand: "npm ci && npm run build",
      watchPatterns: ["frontend-table/**"],
    },
    start: "npm run start",
    healthcheck: "/",
    healthcheckTimeout: 300,
    deploy: {
      restartPolicyType: "ON_FAILURE",
    },
    env: {
      NAKAMA_HOST: "http://backend-core.railway.internal:7350",
      NAKAMA_SERVER_KEY: "defaultkey",
      // Browser-exposed so the nakama-js client authenticates with the real key
      // (must match backend-core's socket server key).
      NEXT_PUBLIC_NAKAMA_SERVER_KEY: "defaultkey",
      NEXT_PUBLIC_NAKAMA_HOST: "https://${{backend-core.RAILWAY_PUBLIC_DOMAIN}}",
      ENGINE_MATH_URL: "http://engine-math.railway.internal:8080",
      NEXT_PUBLIC_ENGINE_MATH_URL: "https://${{engine-math.RAILWAY_PUBLIC_DOMAIN}}",
    },
  });

  // NOTE: OddSlingers is intentionally NOT defined here. It is an optional
  // companion (not the gameplay backend), and adding it to the core IaC risked
  // breaking `railway config apply` for the whole stack over an unvalidated
  // Docker-image source. Deploy it separately/deliberately using
  // `oddslingers-deploy/Dockerfile` + `oddslingers-deploy/README.md` once the
  // core stack is confirmed healthy.

  return project("poker-next-gen", {
    resources: [group("Core stack", [db, engineMath, backendCore, frontendTable])],
  });
});
