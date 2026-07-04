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
      NEXT_PUBLIC_NAKAMA_HOST: "https://${{backend-core.RAILWAY_PUBLIC_DOMAIN}}",
      ENGINE_MATH_URL: "http://engine-math.railway.internal:8080",
      NEXT_PUBLIC_ENGINE_MATH_URL: "https://${{engine-math.RAILWAY_PUBLIC_DOMAIN}}",
    },
  });

  return project("poker-next-gen", {
    resources: [group("Core stack", [db, engineMath, backendCore, frontendTable])],
  });
});
