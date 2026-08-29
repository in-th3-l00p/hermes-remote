import { createSandboxApp } from "../packages/examples-backend/src/index.ts";

const app = createSandboxApp({
  ...(process.env["GROQ_API_KEY"] === undefined
    ? {}
    : { groqKey: process.env["GROQ_API_KEY"] }),
});

const server = Bun.serve({
  port: Number(process.env["PORT"] ?? 8644),
  fetch(request, bunServer) {
    return app.fetch(request, bunServer.requestIP(request)?.address);
  },
});

console.log(
  `sandbox listening on http://localhost:${server.port} (${process.env["GROQ_API_KEY"] === undefined ? "demo mode" : "groq"})`,
);
