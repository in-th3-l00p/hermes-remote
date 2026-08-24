import { handleChatRoute, type ChatOptions } from "./chat/routes.ts";
import type { UserTokenVerifier } from "./auth/supabase.ts";
import type { ApiKeyRecord } from "./store/keys.ts";

export interface KeyVerifier {
  verifyToken(token: string): Promise<ApiKeyRecord | null>;
}

export type Principal =
  | { type: "api_key"; record: ApiKeyRecord }
  | { type: "user"; userId: string; email?: string }
  | { type: "anonymous" };

export interface AppOptions {
  version?: string;
  store?: KeyVerifier;
  chat?: ChatOptions;
  /** Verifier for end-user bearer tokens (e.g. Supabase HS256 or JWKS). */
  userVerifier?: UserTokenVerifier;
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
  const { store, userVerifier } = options;

  async function authenticate(
    request: Request,
  ): Promise<Principal | Response> {
    const header = request.headers.get("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (token === null) {
      return options.anonymous === true
        ? { type: "anonymous" }
        : error(401, "unauthorized", "Missing bearer token");
    }
    if (token.startsWith("hk_")) {
      if (store === undefined) {
        return error(503, "auth_unavailable", "No key store configured");
      }
      const record = await store.verifyToken(token);
      return record === null
        ? error(401, "unauthorized", "Invalid or revoked API key")
        : { type: "api_key", record };
    }
    if (userVerifier !== undefined) {
      const user = await userVerifier.verify(token);
      if (user !== null) {
        return {
          type: "user",
          userId: user.sub,
          ...(user.email === undefined ? {} : { email: user.email }),
        };
      }
    }
    return error(401, "unauthorized", "Invalid bearer token");
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
      if (principal.type === "api_key") {
        return Response.json({
          type: "api_key",
          id: principal.record.id,
          name: principal.record.name,
          scopes: principal.record.scopes,
        });
      }
      if (principal.type === "user") {
        return Response.json({
          type: "user",
          id: principal.userId,
          ...(principal.email === undefined ? {} : { email: principal.email }),
        });
      }
      return Response.json({ type: "anonymous" });
    }

    if (options.chat !== undefined) {
      const principal = await authenticate(request);
      if (principal instanceof Response) {
        return principal;
      }
      const handled = await handleChatRoute(request, url, options.chat, principal);
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
