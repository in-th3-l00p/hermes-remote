import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AuthProvider, KeyVerifier } from "../auth/index.ts";
import { chatRoutes, type ChatEnv, type ChatOptions } from "../chat/index.ts";
import { RunStore, upstreamRoutes, type Upstream } from "../upstream/index.ts";
import { DEFAULT_LIMITS, type Limits, type RateLimitOptions } from "../limits/index.ts";
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
}

export interface UpstreamAppOptions {
  upstream: Upstream;
  /** Run-ownership store; defaults to an in-memory store. */
  runStore?: RunStore;
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

export interface App {
  fetch(request: Request, clientIp?: string): Response | Promise<Response>;
}

const DEFAULT_AUTH_FAILURE_LIMIT: RateLimitOptions = {
  limit: 30,
  windowSeconds: 60,
};

export function createApp(options: AppOptions = {}): App {
  const version = options.version ?? "1.0.0";
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

  return {
    fetch: (request, clientIp) => app.fetch(request, { clientIp }),
  };
}
