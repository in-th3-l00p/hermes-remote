import { authenticate, principalKey, type KeyVerifier, type Principal } from "../auth/index.ts";
import type { AuthProvider } from "../auth/index.ts";
import { handleChatRoute, type ChatOptions } from "../chat/index.ts";
import { DEFAULT_LIMITS, RateLimiter, type Limits, type RateLimitOptions } from "../limits/index.ts";
import { applyCors, corsOrigin, preflightResponse } from "./cors.ts";
import { whoamiBody } from "./whoami.ts";

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
  /** Provider for end-user bearer tokens (Supabase, Clerk, generic JWT, or custom). */
  authProvider?: AuthProvider;
  /** Allow unauthenticated access to chat routes (demo / anonymous mode). */
  anonymous?: boolean;
  /** Origins allowed for browser calls; enables CORS handling. */
  corsOrigins?: string[];
  limits?: Partial<Limits>;
  rateLimit?: RateLimitOptions;
  /** Fixed window applied to failed auth attempts per client ip; always on. */
  authFailureLimit?: RateLimitOptions;
  audit?: (entry: AuditEntry) => void;
  now?: () => Date;
}

export interface App {
  fetch(request: Request, clientIp?: string): Response | Promise<Response>;
}

function error(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

function rateLimited(retryAfter: number): Response {
  const res = error(429, "rate_limited", "Too many requests");
  res.headers.set("retry-after", String(retryAfter));
  return res;
}

const DEFAULT_AUTH_FAILURE_LIMIT: RateLimitOptions = {
  limit: 30,
  windowSeconds: 60,
};

export function createApp(options: AppOptions = {}): App {
  const version = options.version ?? "1.0.0";
  const limits: Limits = { ...DEFAULT_LIMITS, ...options.limits };
  const rateLimiter =
    options.rateLimit === undefined
      ? null
      : new RateLimiter(options.rateLimit);
  const authFailures = new RateLimiter(
    options.authFailureLimit ?? DEFAULT_AUTH_FAILURE_LIMIT,
  );
  const now = options.now ?? (() => new Date());

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

    // Blocks repeated credential guessing before the argon2 verify runs.
    const failKey = `ip:${clientIp ?? "unknown"}`;
    const blocked = authFailures.peek(failKey);
    if (blocked !== null) {
      return { response: rateLimited(blocked), principal: null };
    }

    const principal = await authenticate(request, clientIp, options);
    if ("code" in principal) {
      if (principal.status === 401) {
        authFailures.check(failKey);
      }
      return {
        response: error(principal.status, principal.code, principal.message),
        principal: null,
      };
    }

    if (rateLimiter !== null) {
      const retryAfter = rateLimiter.check(principalKey(principal));
      if (retryAfter !== null) {
        return { response: rateLimited(retryAfter), principal };
      }
    }

    if (url.pathname === "/v1/auth/whoami" && request.method === "GET") {
      return { response: Response.json(whoamiBody(principal)), principal };
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
      const origin = corsOrigin(origins, request);
      if (origins.length > 0 && request.method === "OPTIONS") {
        return preflightResponse(origin as string);
      }
      const { response, principal } = await route(request, clientIp);
      if (origins.length > 0) {
        applyCors(response, origin as string);
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
