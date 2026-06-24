import react from "@vitejs/plugin-react";
import UnoCSS from "unocss/vite";
import { fileURLToPath, URL } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), UnoCSS()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "e2e/**"],
    globals: true,
  },
});
