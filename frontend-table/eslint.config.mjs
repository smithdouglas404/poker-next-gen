import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    // src/features/hrc is the HighRollersClub table kept as a VERBATIM copy so it can
    // be re-synced from that repo. Its house style is looser than ours (untyped
    // websocket payloads, plain <img>, a conditional hook in Card.tsx). Rewriting it
    // to satisfy our rules would fork the copy and make future re-syncs a merge
    // problem, so the rules are relaxed for this path only.
    //
    // Our own code — including the adapter and HrcTable that bind it to Nakama — is
    // NOT covered by this and stays under the full rule set.
    files: ["src/features/hrc/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/rules-of-hooks": "off",
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
