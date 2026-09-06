import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        fetch: "readonly",
        Response: "readonly",
        Request: "readonly",
        Headers: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        AbortSignal: "readonly",
        AbortController: "readonly",
        DOMException: "readonly",
        crypto: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        console: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.test.ts", "src/test-support/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
