import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBaseUrl = new URL(env.VITE_SMARTAPI_BASE_URL || "https://co.agentrouter.org/v1");
  const apiPath = apiBaseUrl.pathname.replace(/\/$/, "");

  return ({
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
        // Keep provider traffic same-origin in the browser during development.
        target: apiBaseUrl.origin,
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/smartapi/, apiPath),
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
});
