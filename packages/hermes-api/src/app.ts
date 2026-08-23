export interface AppOptions {
  version?: string;
}

export interface App {
  fetch(request: Request): Response | Promise<Response>;
}

export function createApp(options: AppOptions = {}): App {
  const version = options.version ?? "0.0.1";
  return {
    fetch(request: Request): Response {
      const url = new URL(request.url);
      if (url.pathname === "/v1/status" && request.method === "GET") {
        return Response.json({ ok: true, version });
      }
      return Response.json(
        { error: { code: "not_found", message: "Unknown route" } },
        { status: 404 },
      );
    },
  };
}
