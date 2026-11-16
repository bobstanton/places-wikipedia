import json from "@eslint/json";
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: ["main.js", "styles.css", "**/*.map"],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-empty": ["error", { "allowEmptyCatch": true }],
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/restrict-template-expressions": "warn",
    },
  },
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "obsidianmd/no-global-this": "off",
      "obsidianmd/prefer-window-timers": "off",
    },
  },
  {
    files: ["**/generated-help/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "obsidianmd/hardcoded-config-path": "off",
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
  {
    files: ["package.json", "manifest.json", "versions.json"],
    language: "json/json",
    plugins: { json },
    rules: {
      ...json.configs.recommended.rules,
      "no-irregular-whitespace": "off",
      "obsidianmd/validate-manifest": "warn",
    },
  },
]);
