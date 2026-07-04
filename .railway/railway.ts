import { defineRailway, github, group, postgres, project, service } from "railway/iac";

/** GitHub repo for this monorepo — used by Railway IaC to wire all services. */
const REPO = "smithdouglas404/poker-next-gen";

export default defineRailway(() => {
  const db = postgres("postgres");

  const engineMath = service("engine-math", {
    source: github(REPO, { rootDirectory: "engine-math" }),
    healthcheck: "/health",
    healthcheckTimeout: 300,
  });

  const backendCore = service("backend-core", {
    source: github(REPO, { rootDirectory: "backend-core" }),
    healthcheck: "/healthcheck",
    healthcheckTimeout: 300,
    env: {
      DATABASE_ADDRESS: db.env.DATABASE_URL,
      ENGINE_MATH_URL: `http://${engineMath.env.RAILWAY_PRIVATE_DOMAIN}:8080`,
      NAKAMA_LOG_LEVEL: "INFO",
    },
  });

  const frontendTable = service("frontend-table", {
    source: github(REPO, { rootDirectory: "frontend-table" }),
    build: "npm ci && npm run build",
    start: "npm run start",
    healthcheck: "/",
    healthcheckTimeout: 300,
    env: {
      NAKAMA_HOST: `http://${backendCore.env.RAILWAY_PRIVATE_DOMAIN}:7350`,
      NAKAMA_SERVER_KEY: "defaultkey",
      NEXT_PUBLIC_NAKAMA_HOST: `https://${backendCore.env.RAILWAY_PUBLIC_DOMAIN}`,
      ENGINE_MATH_URL: `http://${engineMath.env.RAILWAY_PRIVATE_DOMAIN}:8080`,
      NEXT_PUBLIC_ENGINE_MATH_URL: `https://${engineMath.env.RAILWAY_PUBLIC_DOMAIN}`,
    },
  });

  return project("poker-next-gen", {
    resources: [group("Core stack", [db, engineMath, backendCore, frontendTable])],
  });
});
