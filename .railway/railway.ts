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

  const openprojectMcp = service("openproject-mcp", {
    source: github(REPO, { rootDirectory: "openproject-mcp" }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
      watchPatterns: ["openproject-mcp/**"],
    },
    healthcheck: "/health",
    healthcheckTimeout: 300,
    deploy: {
      restartPolicyType: "ALWAYS",
    },
    env: {
      PORT: "8090",
      OPENPROJECT_MCP_STATE_PATH: "/data/state.json",
      OPENPROJECT_MCP_INTERVAL_SECONDS: "3600",
      OPENPROJECT_MCP_MODEL: "claude-opus-4-8",
      // Secrets — set these in the Railway dashboard (not committed here):
      //   OPENPROJECT_MCP_ADMIN_TOKEN  shared bearer token (also referenced by frontend-table)
      //   OPENPROJECT_MCP_URL          https://<your-openproject>/mcp
      //   OPENPROJECT_MCP_TOKEN        OpenProject MCP auth token
      //   OPENPROJECT_API_BASE_URL     https://<your-openproject>
      //   OPENPROJECT_API_TOKEN        OpenProject API key (write-back)
      //   ANTHROPIC_API_KEY            Claude API key
      //   FALKORDB_URL                 redis://<host>:<port> (or FALKORDB_HOST/PORT/PASSWORD)
      //   FALKORDB_GRAPH               graph name (default: openproject)
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
      // OpenProject MCP review agent (server-side proxy target + shared token).
      OPENPROJECT_MCP_SERVICE_URL: "http://openproject-mcp.railway.internal:8090",
      OPENPROJECT_MCP_ADMIN_TOKEN: "${{openproject-mcp.OPENPROJECT_MCP_ADMIN_TOKEN}}",
    },
  });

  return project("poker-next-gen", {
    resources: [
      group("Core stack", [db, engineMath, backendCore, frontendTable]),
      group("Integrations", [openprojectMcp]),
    ],
  });
});
