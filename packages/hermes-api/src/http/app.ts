import { VERSION } from "../version.ts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { BridgeDenied } from "../bridge/index.ts";
import { HermesUpstreamError } from "../chat/index.ts";
import { bodyLimit } from "hono/body-limit";
import type { AuthProvider, KeyVerifier } from "../auth/index.ts";
import { chatRoutes, type ChatEnv, type ChatOptions } from "../chat/index.ts";
import { RunStore, upstreamRoutes, type Upstream } from "../upstream/index.ts";
import { DEFAULT_LIMITS, clientIp, type Limits, type RateLimitOptions } from "../limits/index.ts";
import { registerProfileRoutes } from "../profiles/index.ts";
import { registerFsRoutes, registerMgmtRoutes } from "../mgmt/index.ts";
import { registerCommandRoutes } from "../mgmt/commands.ts";
import { registerGoalRoutes } from "../mgmt/goals.ts";
import { EventBus, registerEventRoutes } from "../events/index.ts";
import type { ManagementOptions } from "../mgmt/shared.ts";
import {
  auditMiddleware,
  authFailureLimiter,
  authMiddleware,
  corsMiddleware,
  errorResponse,
  principalRateLimiter,
  profileMiddleware,
} from "./middleware.ts";
import { whoamiBody } from "./whoami.ts";

export interface AuditEntry {
  at: string;
  method: string;
  path: string;
  status: number;
  principal: string;
  /** Client address as resolved for this request, when known. */
  ip?: string;
}

export interface UpstreamAppOptions {
  upstream: Upstream;
  /** Run-ownership store; defaults to an in-memory store. */
  runStore?: RunStore;
  /** Poll cadence for templated tool runs (media/web endpoints). */
  pollMs?: number;
  toolRunTimeoutMs?: number;
}

export interface AppOptions {
  version?: string;
  store?: KeyVerifier;
  chat?: ChatOptions;
  /** Enables the discovery, runs, and jobs routes. */
  upstream?: UpstreamAppOptions;
  /** Enables the profile, config, and agent-management routes. */
  management?: ManagementOptions;
  /** Provider for end-user bearer tokens (Supabase, Clerk, generic JWT, or custom). */
  authProvider?: AuthProvider;
  /** Allow unauthenticated access to chat routes (demo / anonymous mode). */
  anonymous?: boolean;
  /** Origins allowed for browser calls; enables CORS handling. */
  corsOrigins?: string[];
  /**
   * CIDRs of reverse proxies whose X-Forwarded-For is trusted. Without it the
   * socket peer is the client, which is what CIDR pinning and per-IP limits see.
   */
  trustProxy?: string[];
  limits?: Partial<Limits>;
  rateLimit?: RateLimitOptions;
  /** Fixed window applied to failed auth attempts per client ip; always on. */
  authFailureLimit?: RateLimitOptions;
  audit?: (entry: AuditEntry) => void;
  /** Lifecycle event bus backing GET /v1/events; created when absent. */
  events?: EventBus;
  /** Enables the slash-command relay through upstream session chat. */
  commandRelay?: boolean;
  /** Heartbeat cadence for the /v1/events stream. */
  eventsHeartbeatMs?: number;
  now?: () => Date;
}

export interface RouteInfo {
  method: string;
  path: string;
}

export interface App {
  fetch(request: Request, clientIp?: string): Response | Promise<Response>;
  /** Every registered route handler (middleware excluded), in order. */
  readonly routes: RouteInfo[];
}

const DEFAULT_AUTH_FAILURE_LIMIT: RateLimitOptions = {
  limit: 30,
  windowSeconds: 60,
};

export function createApp(options: AppOptions = {}): App {
  const version = options.version ?? VERSION;
  const limits: Limits = { ...DEFAULT_LIMITS, ...options.limits };
  const now = options.now ?? (() => new Date());
  const events = options.events ?? new EventBus(now);
  const app = new Hono<ChatEnv>();

  const origins = options.corsOrigins ?? [];
  if (origins.length > 0) {
    app.use(corsMiddleware(origins));
  }
  if (options.audit !== undefined) {
    app.use(auditMiddleware(options.audit, now));
  }

  app.get("/v1/status", (c) => c.json({ ok: true, version }));

  app.use(
    bodyLimit({
      maxSize: limits.maxBodyBytes,
      onError: (c) =>
        errorResponse(c, 413, "payload_too_large", "Request body too large"),
    }),
  );
  app.use(
    authFailureLimiter(options.authFailureLimit ?? DEFAULT_AUTH_FAILURE_LIMIT),
  );
  app.use(authMiddleware(options));
  if (options.rateLimit !== undefined) {
    app.use(principalRateLimiter(options.rateLimit));
  }

  if (options.management !== undefined) {
    app.use(profileMiddleware(options.management));
  }

  app.get("/v1/auth/whoami", (c) => c.json(whoamiBody(c.get("principal"))));
  registerEventRoutes(app, events, options.eventsHeartbeatMs ?? 15_000);
  if (options.management !== undefined) {
    registerProfileRoutes(app, options.management);
    registerMgmtRoutes(app, options.management);
    registerFsRoutes(app, options.management);
  }
  if (options.upstream !== undefined) {
    app.route(
      "/",
      upstreamRoutes({
        upstream: options.upstream.upstream,
        runStore: options.upstream.runStore ?? new RunStore(),
        version,
        ...(options.authProvider === undefined
          ? {}
          : { authProviderName: options.authProvider.name }),
        anonymous: options.anonymous === true,
        events,
        ...(options.upstream.pollMs === undefined
          ? {}
          : { pollMs: options.upstream.pollMs }),
        ...(options.upstream.toolRunTimeoutMs === undefined
          ? {}
          : { toolRunTimeoutMs: options.upstream.toolRunTimeoutMs }),
      }),
    );
    const relayOptions = {
      upstream: options.upstream.upstream,
      events,
      commandRelay: options.commandRelay === true,
    };
    registerCommandRoutes(app, relayOptions);
    if (options.management !== undefined) {
      registerGoalRoutes(app, {
        ...relayOptions,
        management: options.management,
      });
    }
  }
  if (options.chat !== undefined) {
    app.route("/", chatRoutes(options.chat, limits));
  }
  app.notFound((c) => errorResponse(c, 404, "not_found", "Unknown route"));
  // Last resort: every failure leaves as the JSON error envelope.
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    if (err instanceof HermesUpstreamError) {
      return c.json(
        {
          error: {
            code: "upstream_error",
            message: err.message,
            upstreamStatus: err.status,
          },
        },
        502,
      );
    }
    if (err instanceof BridgeDenied) {
      return errorResponse(c, 400, "path_denied", err.reason);
    }
    // Bun aborts a streamed body that outgrows maxRequestBodySize mid-read.
    if (err.message.includes("maxRequestBodySize")) {
      return errorResponse(c, 413, "payload_too_large", "Request body too large");
    }
    console.error("hermes-remote: unhandled error", err);
    return errorResponse(c, 500, "internal_error", "Internal server error");
  });

  const routes = app.routes
    .filter((r) => r.method !== "ALL")
    .map((r) => ({ method: r.method, path: r.path }));
  return {
    fetch: (request, socketIp) =>
      app.fetch(request, {
        clientIp: clientIp(
          request.headers.get("x-forwarded-for"),
          socketIp,
          options.trustProxy ?? [],
        ),
      }),
    routes,
  };
}
