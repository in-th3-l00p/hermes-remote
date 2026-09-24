import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Served under /examples/chat/app/ on the site; `vite dev` uses /.
  base: process.env["CHAT_BASE"] ?? "/",
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
});
