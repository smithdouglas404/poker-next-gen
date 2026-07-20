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

  // --- OddSlingers (optional companion platform) --------------------------
  // Deployed as its own service group with its own Postgres + Redis. The web
  // service builds from oddslingers-deploy/Dockerfile, which git-clones the
  // pinned upstream commit at build time (see that file's header). This is NOT
  // the gameplay backend — Nakama + rs_poker remain authoritative. The build
  // has not been validated from CI; expect one or two real build iterations.
  const oddsDb = postgres("oddslingers-postgres");
  const oddsRedis = service("oddslingers-redis", {
    source: { image: "redis:5-alpine" },
    deploy: { restartPolicyType: "ON_FAILURE" },
  });
  const oddslingers = service("oddslingers-web", {
    source: github(REPO, { rootDirectory: "." }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "oddslingers-deploy/Dockerfile",
      watchPatterns: ["oddslingers-deploy/**"],
    },
    healthcheckTimeout: 600,
    deploy: { restartPolicyType: "ON_FAILURE" },
    env: {
      ODDSLINGERS_ENV: "PROD",
      IS_DOCKER: "1",
      POSTGRES_HOST: oddsDb.env.PGHOST,
      POSTGRES_PORT: oddsDb.env.PGPORT,
      POSTGRES_DB: oddsDb.env.PGDATABASE,
      POSTGRES_USER: oddsDb.env.PGUSER,
      POSTGRES_PASSWORD: oddsDb.env.PGPASSWORD,
      REDIS_HOST: "oddslingers-redis.railway.internal",
      // SECRET_KEY must be set as a Railway secret (do not commit it).
      ALLOWED_HOSTS: "${{oddslingers-web.RAILWAY_PUBLIC_DOMAIN}}",
      DEFAULT_HOST: "${{oddslingers-web.RAILWAY_PUBLIC_DOMAIN}}",
      SERVE_STATIC: "True",
    },
  });

  return project("poker-next-gen", {
    resources: [
      group("Core stack", [db, engineMath, backendCore, frontendTable]),
      group("OddSlingers (optional)", [oddsDb, oddsRedis, oddslingers]),
    ],
  });
});
