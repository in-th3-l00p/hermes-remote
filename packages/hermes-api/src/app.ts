import { handleChatRoute, type ChatOptions } from "./chat/routes.ts";
import { DEFAULT_LIMITS, RateLimiter, ipInCidr, type Limits, type RateLimitOptions } from "./limits.ts";
import type { UserTokenVerifier } from "./auth/supabase.ts";
import type { ApiKeyRecord } from "./store/keys.ts";

export interface KeyVerifier {
  verifyToken(token: string): Promise<ApiKeyRecord | null>;
}

export type Principal =
  | { type: "api_key"; record: ApiKeyRecord }
  | { type: "user"; userId: string; email?: string }
  | { type: "anonymous" };

export interface AuditEntry {
  at: string;
  method: string;
  path: string;
  status: number;
  principal: string;
}

export interface AppOptions {
  version?: string;
  store?: KeyVerifier;
  chat?: ChatOptions;
  /** Verifier for end-user bearer tokens (e.g. Supabase HS256 or JWKS). */
  userVerifier?: UserTokenVerifier;
  /** Allow unauthenticated access to chat routes (demo / anonymous mode). */
  anonymous?: boolean;
  /** Origins allowed for browser calls; enables CORS handling. */
  corsOrigins?: string[];
  limits?: Partial<Limits>;
  rateLimit?: RateLimitOptions;
  audit?: (entry: AuditEntry) => void;
  now?: () => Date;
}

export interface App {
  fetch(request: Request, clientIp?: string): Response | Promise<Response>;
}

function error(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

function principalKey(principal: Principal): string {
  if (principal.type === "api_key") {
    return `key:${principal.record.id}`;
  }
  if (principal.type === "user") {
    return `user:${principal.userId}`;
  }
  return "anonymous";
}

export function createApp(options: AppOptions = {}): App {
  const version = options.version ?? "1.0.0";
  const { store, userVerifier } = options;
  const limits: Limits = { ...DEFAULT_LIMITS, ...options.limits };
  const rateLimiter =
    options.rateLimit === undefined
      ? null
      : new RateLimiter(options.rateLimit);
  const now = options.now ?? (() => new Date());

  async function authenticate(
    request: Request,
    clientIp: string | undefined,
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
      if (record === null) {
        return error(401, "unauthorized", "Invalid or revoked API key");
      }
      const cidrs = record.cidrs ?? [];
      if (
        cidrs.length > 0 &&
        (clientIp === undefined || !cidrs.some((c) => ipInCidr(clientIp, c)))
      ) {
        return error(401, "unauthorized", "API key not allowed from this address");
      }
      return { type: "api_key", record };
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

  async function route(
    request: Request,
    clientIp: string | undefined,
  ): Promise<{ response: Response; principal: Principal | null }> {
    const url = new URL(request.url);

    if (url.pathname === "/v1/status" && request.method === "GET") {
      return {
        response: Response.json({ ok: true, version }),
        principal: null,
      };
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > limits.maxBodyBytes) {
      return {
        response: error(413, "payload_too_large", "Request body too large"),
        principal: null,
      };
    }

    const principal = await authenticate(request, clientIp);
    if (principal instanceof Response) {
      return { response: principal, principal: null };
    }

    if (rateLimiter !== null) {
      const retryAfter = rateLimiter.check(principalKey(principal));
      if (retryAfter !== null) {
        const res = error(429, "rate_limited", "Too many requests");
        res.headers.set("retry-after", String(retryAfter));
        return { response: res, principal };
      }
    }

    if (url.pathname === "/v1/auth/whoami" && request.method === "GET") {
      let body: unknown;
      if (principal.type === "api_key") {
        body = {
          type: "api_key",
          id: principal.record.id,
          name: principal.record.name,
          scopes: principal.record.scopes,
        };
      } else if (principal.type === "user") {
        body = {
          type: "user",
          id: principal.userId,
          ...(principal.email === undefined ? {} : { email: principal.email }),
        };
      } else {
        body = { type: "anonymous" };
      }
      return { response: Response.json(body), principal };
    }

    if (options.chat !== undefined) {
      const handled = await handleChatRoute(
        request,
        url,
        options.chat,
        principal,
        limits,
      );
      if (handled !== null) {
        return { response: handled, principal };
      }
    }

    return {
      response: error(404, "not_found", "Unknown route"),
      principal,
    };
  }

  return {
    async fetch(request: Request, clientIp?: string): Promise<Response> {
      const origins = options.corsOrigins ?? [];
      const requestOrigin = request.headers.get("origin");
      const matchedOrigin =
        requestOrigin !== null && origins.includes(requestOrigin)
          ? requestOrigin
          : origins[0];
      if (origins.length > 0 && request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": matchedOrigin as string,
            "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
            "access-control-allow-headers": "authorization,content-type",
            vary: "origin",
          },
        });
      }
      const { response, principal } = await route(request, clientIp);
      if (origins.length > 0) {
        response.headers.set(
          "access-control-allow-origin",
          matchedOrigin as string,
        );
        response.headers.set("vary", "origin");
      }
      if (
        options.audit !== undefined &&
        (request.method !== "GET" || response.status === 401)
      ) {
        options.audit({
          at: now().toISOString(),
          method: request.method,
          path: new URL(request.url).pathname,
          status: response.status,
          principal: principal === null ? "unauthenticated" : principalKey(principal),
        });
      }
      return response;
    },
  };
}
