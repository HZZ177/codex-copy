import react from "@vitejs/plugin-react";
import UnoCSS from "unocss/vite";
import { fileURLToPath, URL } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const CODEMIRROR_DEDUPE = [
  "@codemirror/lang-css",
  "@codemirror/lang-html",
  "@codemirror/lang-javascript",
  "@codemirror/lang-json",
  "@codemirror/lang-markdown",
  "@codemirror/lang-python",
  "@codemirror/lang-sql",
  "@codemirror/lang-xml",
  "@codemirror/lang-yaml",
  "@codemirror/language",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
];

export default defineConfig({
  plugins: [react(), UnoCSS()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["react", "react-dom", ...CODEMIRROR_DEDUPE],
  },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "e2e/**"],
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
