import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Listen on all local interfaces so both localhost and 127.0.0.1 work.
    // Binding only 127.0.0.1 breaks Cursor/browser when they hit ::1 → ERR_CONNECTION_REFUSED.
    host: host || true,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**", "**/dist-installers/**"],
    },
    proxy: {
      "/smartapi": {
        target: "https://api.smartapi.shop",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/smartapi/, "/v1"),
      },
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
  worker: {
    format: "es",
  },
});
