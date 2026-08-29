import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ChatStore,
  createApp,
  JwtAuthProvider,
  ProfileRegistry,
  RunStore,
} from "@in-th3-l00p/hermes-remote";
import type {
  ApiKeyRecord,
  App,
  KeyVerifier,
} from "@in-th3-l00p/hermes-remote";
import { sandboxCli } from "./cli.ts";
import { SANDBOX_PROFILES, seedSandboxHome, type SandboxProfile } from "./home.ts";
import { SandboxUpstream, type SandboxOptions } from "./upstream.ts";

export const SUPABASE_JWKS_URL =
  "https://jhvuzxmhyyyovzgtdwvl.supabase.co/auth/v1/.well-known/jwks.json";

/** Deliberately public: the sandbox is anonymous-grade either way. */
export const SANDBOX_KEY_TOKEN = "hk_sandb0x.live-examples-public-token";

export const SANDBOX_KEY_SCOPES = [
  "chat:invoke",
  "sessions:read",
  "sessions:write",
  "sessions:read-all",
  "sessions:write-all",
  "status:read",
  "skills:read",
  "skills:write",
  "toolsets:read",
  "bundles:read",
  "bundles:write",
  "config:read",
  "config:write",
  "memory:read",
  "memory:write",
  "soul:read",
  "soul:write",
  "crons:read",
  "insights:read",
  "logs:read",
  "kanban:read",
  "goals:read",
  "goals:write",
  "events:subscribe",
  "subagents:read",
  "checkpoints:rollback",
];

function sandboxKeyVerifier(): KeyVerifier {
  const record: ApiKeyRecord = {
    id: "sandb0x",
    name: "live-examples",
    hash: "public-sandbox-key",
    scopes: SANDBOX_KEY_SCOPES,
    userGrantable: [],
    createdAt: "2026-08-29T00:00:00.000Z",
    expiresAt: null,
    revoked: false,
  };
  return {
    verifyToken: async (token) =>
      token === SANDBOX_KEY_TOKEN ? record : null,
  };
}

export interface SandboxAppOptions extends SandboxOptions {
  /** Root under which the profile homes are seeded; a temp dir by default. */
  homeRoot?: string;
}

export function createSandboxApp(options: SandboxAppOptions = {}): App {
  const homeRoot =
    options.homeRoot ?? mkdtempSync(join(tmpdir(), "hermes-sandbox-"));
  for (const profile of SANDBOX_PROFILES) {
    seedSandboxHome(join(homeRoot, profile), profile);
  }
  const homeFor = (profile: string | null): string =>
    join(
      homeRoot,
      SANDBOX_PROFILES.includes(profile as SandboxProfile)
        ? (profile as SandboxProfile)
        : "default",
    );
  const cli = sandboxCli();
  const upstream = new SandboxUpstream(options);
  return createApp({
    version: "sandbox",
    anonymous: true,
    store: sandboxKeyVerifier(),
    authProvider: new JwtAuthProvider({ jwksUrl: SUPABASE_JWKS_URL }),
    rateLimit: { limit: 30, windowSeconds: 60 },
    limits: { maxMessageChars: 2000, maxAttachments: 1 },
    chat: {
      store: new ChatStore(),
      agent: upstream.chat,
      turns: new Map(),
    },
    upstream: { upstream, runStore: new RunStore(), pollMs: 100 },
    management: {
      cli,
      profiles: new ProfileRegistry({ cli, homeFor }),
      homeFor,
    },
    commandRelay: false,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

const API_PREFIX = "/api/hermes";

export function stripApiPrefix(request: Request): Request {
  const url = new URL(request.url);
  if (url.pathname.startsWith(API_PREFIX)) {
    url.pathname = url.pathname.slice(API_PREFIX.length) || "/";
    return new Request(url.toString(), request);
  }
  return request;
}

export function vercelHandler(
  options: SandboxAppOptions = {},
): (request: Request) => Promise<Response> {
  let app: App | null = null;
  return async (request: Request): Promise<Response> => {
    app ??= createSandboxApp(options);
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      undefined;
    return app.fetch(stripApiPrefix(request), ip);
  };
}
