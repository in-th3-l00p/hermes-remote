import type { Context, MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { rateLimiter } from "hono-rate-limiter";
import {
  authenticate,
  principalKey,
  type AuthenticateOptions,
  type Principal,
} from "../auth/index.ts";
import type { RateLimitOptions } from "../limits/index.ts";
import type { ChatEnv } from "../chat/index.ts";
import type { ManagementOptions } from "../mgmt/shared.ts";
import type { AuditEntry } from "./app.ts";

type ErrorStatus = 401 | 403 | 404 | 413 | 429 | 503;

export function errorResponse(
  c: Context<ChatEnv>,
  status: ErrorStatus,
  code: string,
  message: string,
): Response {
  return c.json({ error: { code, message } }, status);
}

export function corsMiddleware(origins: string[]): MiddlewareHandler<ChatEnv> {
  return cors({
    origin: (origin) => (origins.includes(origin) ? origin : origins[0]),
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["authorization", "content-type"],
  });
}

export function authMiddleware(
  options: AuthenticateOptions,
): MiddlewareHandler<ChatEnv> {
  return async (c, next) => {
    const principal = await authenticate(c.req.raw, c.env.clientIp, options);
    if ("code" in principal) {
      return errorResponse(
        c,
        principal.status as ErrorStatus,
        principal.code,
        principal.message,
      );
    }
    c.set("principal", principal);
    await next();
  };
}

/** Resolves the target profile from the header and the key's restriction. */
export function profileMiddleware(
  options: ManagementOptions,
): MiddlewareHandler<ChatEnv> {
  return async (c, next) => {
    const principal = c.get("principal");
    const requested = c.req.header("x-hermes-profile") ?? null;
    const keyProfile =
      principal.type === "api_key" ? (principal.record.profile ?? null) : null;
    if (requested !== null && !(await options.profiles.exists(requested))) {
      return errorResponse(c, 404, "profile_not_found", "Unknown profile");
    }
    if (
      keyProfile !== null &&
      requested !== null &&
      requested !== keyProfile
    ) {
      return errorResponse(
        c,
        403,
        "profile_forbidden",
        "This API key is restricted to another profile",
      );
    }
    c.set("profile", requested ?? keyProfile);
    await next();
  };
}

function rateLimited(c: Context<ChatEnv>): Response {
  return errorResponse(c, 429, "rate_limited", "Too many requests");
}

/** Counts only 401 responses; blocks credential guessing before argon2 runs. */
export function authFailureLimiter(
  options: RateLimitOptions,
): MiddlewareHandler<ChatEnv> {
  return rateLimiter<ChatEnv>({
    windowMs: options.windowSeconds * 1000,
    limit: options.limit,
    keyGenerator: (c) => `ip:${c.env.clientIp ?? "unknown"}`,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (c) => c.res.status !== 401,
    handler: async (c) => rateLimited(c),
  });
}

export function principalRateLimiter(
  options: RateLimitOptions,
): MiddlewareHandler<ChatEnv> {
  return rateLimiter<ChatEnv>({
    windowMs: options.windowSeconds * 1000,
    limit: options.limit,
    keyGenerator: (c) => principalKey(c.get("principal")),
    handler: async (c) => rateLimited(c),
  });
}

export function auditMiddleware(
  audit: (entry: AuditEntry) => void,
  now: () => Date,
): MiddlewareHandler<ChatEnv> {
  return async (c, next) => {
    await next();
    if (c.req.method === "GET" && c.res.status !== 401) {
      return;
    }
    const principal = c.get("principal") as Principal | undefined;
    audit({
      at: now().toISOString(),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      principal: principal === undefined ? "unauthenticated" : principalKey(principal),
    });
  };
}
