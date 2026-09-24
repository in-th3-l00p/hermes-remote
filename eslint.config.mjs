import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "packages/hermes-ts/src/openapi.ts",
      "apps/landing/docs/.vitepress/cache/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node, Bun: "readonly" } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Rejecting control characters in names and ids is deliberate input validation.
      "no-control-regex": "off",
      // Unused names prefixed with _ are deliberate (destructuring to omit a field).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Tests may use non-null shortcuts and empty stubs freely.
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-empty-function": "off",
    },
  },
);
