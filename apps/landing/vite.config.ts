import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        examples: path.resolve(__dirname, "examples/index.html"),
        exampleChat: path.resolve(__dirname, "examples/chat/index.html"),
        exampleAuth: path.resolve(__dirname, "examples/auth/index.html"),
        exampleConfiguration: path.resolve(
          __dirname,
          "examples/configuration/index.html",
        ),
        exampleRuns: path.resolve(__dirname, "examples/runs/index.html"),
        exampleProfiles: path.resolve(
          __dirname,
          "examples/profiles/index.html",
        ),
        exampleCommandCenter: path.resolve(
          __dirname,
          "examples/command-center/index.html",
        ),
      },
    },
  },
});
