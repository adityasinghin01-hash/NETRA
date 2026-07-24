import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  // Catalyst Web Client Hosting serves the client under /app/ — assets and
  // router basename must match, or the built app 404s its own bundle.
  base: "/app/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    // In dev, proxy API calls to the local Express/AppSail backend when live.
    proxy: {
      "/api": { target: "http://localhost:9000", changeOrigin: true },
    },
  },
});
