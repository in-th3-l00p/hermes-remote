import { handleChatRoute, type ChatOptions } from "./chat/routes.ts";
import type { ApiKeyRecord } from "./store/keys.ts";

export interface KeyVerifier {
  verifyToken(token: string): Promise<ApiKeyRecord | null>;
}

export interface AppOptions {
  version?: string;
  store?: KeyVerifier;
  chat?: ChatOptions;
  /** Allow unauthenticated access to chat routes (demo / anonymous mode). */
  anonymous?: boolean;
  /** Origin allowed for browser calls; enables CORS handling. */
  corsOrigin?: string;
}

export interface App {
  fetch(request: Request): Response | Promise<Response>;
}

function error(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function createApp(options: AppOptions = {}): App {
  const version = options.version ?? "0.1.0";
  const store = options.store;

  async function authenticate(
    request: Request,
  ): Promise<ApiKeyRecord | Response> {
    if (store === undefined) {
      return error(503, "auth_unavailable", "No key store configured");
    }
    const header = request.headers.get("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (token === null) {
      return error(401, "unauthorized", "Missing bearer token");
    }
    const record = await store.verifyToken(token);
    if (record === null) {
      return error(401, "unauthorized", "Invalid or revoked API key");
    }
    return record;
  }

  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/v1/status" && request.method === "GET") {
      return Response.json({ ok: true, version });
    }

    if (url.pathname === "/v1/auth/whoami" && request.method === "GET") {
      const principal = await authenticate(request);
      if (principal instanceof Response) {
        return principal;
      }
      return Response.json({
        type: "api_key",
        id: principal.id,
        name: principal.name,
        scopes: principal.scopes,
      });
    }

    if (options.chat !== undefined) {
      if (options.anonymous !== true) {
        const principal = await authenticate(request);
        if (principal instanceof Response) {
          return principal;
        }
      }
      const handled = await handleChatRoute(request, url, options.chat);
      if (handled !== null) {
        return handled;
      }
    }

    return error(404, "not_found", "Unknown route");
  }

  return {
    async fetch(request: Request): Promise<Response> {
      const origin = options.corsOrigin;
      if (origin !== undefined && request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": origin,
            "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
            "access-control-allow-headers": "authorization,content-type",
          },
        });
      }
      const response = await route(request);
      if (origin !== undefined) {
        response.headers.set("access-control-allow-origin", origin);
      }
      return response;
    },
  };
}
