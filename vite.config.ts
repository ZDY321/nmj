import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": "/src"
      }
    },
    build: {
      outDir: "dist",
      sourcemap: env.VITE_BUILD_SOURCEMAP === "true"
    },
    server: {
      host: "127.0.0.1",
      port: 5173
    }
  };
});
