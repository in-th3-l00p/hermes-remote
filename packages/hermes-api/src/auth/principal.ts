import { ipInCidr } from "../limits/index.ts";
import type { AuthProvider } from "./providers/index.ts";
import type { ApiKeyRecord } from "./keys.ts";
import { UserTokenIssuer, type AgentVisibility, type UserStore } from "../users/index.ts";

export interface KeyVerifier {
  verifyToken(token: string): Promise<ApiKeyRecord | null>;
}

export type Principal =
  | { type: "api_key"; record: ApiKeyRecord }
  | {
      type: "user";
      userId: string;
      email?: string;
      guest?: true;
      /** Set for tokens minted by token exchange: exactly these scopes. */
      scopes?: string[];
      /** Set for exchanged users: what the agent may learn about them. */
      visibility?: AgentVisibility;
      profile?: Record<string, unknown>;
    }
  | { type: "anonymous"; ip?: string };

export interface AuthDenial {
  status: number;
  code: string;
  message: string;
}

export interface AuthenticateOptions {
  store?: KeyVerifier;
  authProvider?: AuthProvider;
  anonymous?: boolean;
  /** Enables tokens minted by POST /v1/auth/token. */
  users?: { store: UserStore; issuer: UserTokenIssuer; now: () => Date };
}

export function principalKey(principal: Principal): string {
  if (principal.type === "api_key") {
    return `key:${principal.record.id}`;
  }
  if (principal.type === "user") {
    return `user:${principal.userId}`;
  }
  return principal.ip === undefined ? "anonymous" : `anonymous:${principal.ip}`;
}

function denial(status: number, code: string, message: string): AuthDenial {
  return { status, code, message };
}

export async function authenticate(
  request: Request,
  clientIp: string | undefined,
  options: AuthenticateOptions,
): Promise<Principal | AuthDenial> {
  const header = request.headers.get("authorization");
  // Auth schemes are case-insensitive (RFC 7235); only Bearer is accepted.
  const token = header === null ? null : (/^bearer +(.+)$/i.exec(header)?.[1] ?? null);
  if (header !== null && token === null) {
    return denial(401, "unauthorized", "Only Bearer authorization is supported");
  }
  if (token === null) {
    return options.anonymous === true
      ? { type: "anonymous", ...(clientIp === undefined ? {} : { ip: clientIp }) }
      : denial(401, "unauthorized", "Missing bearer token");
  }
  if (token.startsWith("hk_")) {
    if (options.store === undefined) {
      return denial(503, "auth_unavailable", "No key store configured");
    }
    const record = await options.store.verifyToken(token);
    if (record === null) {
      return denial(401, "unauthorized", "Invalid or revoked API key");
    }
    const cidrs = record.cidrs ?? [];
    if (
      cidrs.length > 0 &&
      (clientIp === undefined || !cidrs.some((c) => ipInCidr(clientIp, c)))
    ) {
      return denial(401, "unauthorized", "API key not allowed from this address");
    }
    return { type: "api_key", record };
  }
  if (options.users !== undefined && UserTokenIssuer.isOwnToken(token)) {
    const { store, issuer } = options.users;
    const claims = issuer.verify(token, options.users.now());
    const user = claims === null ? null : store.get(claims.sub);
    // Disabling a user bumps its generation, so older tokens stop here.
    if (claims === null || user === null || user.disabled || user.generation !== claims.gen) {
      return denial(401, "unauthorized", "Invalid, expired or revoked user token");
    }
    return {
      type: "user",
      userId: user.id,
      scopes: claims.scp,
      visibility: user.agentVisibility,
      profile: user.profile,
    };
  }
  if (options.authProvider !== undefined) {
    const user = await options.authProvider.verify(token);
    if (user !== null) {
      return {
        type: "user",
        userId: user.sub,
        ...(user.email === undefined ? {} : { email: user.email }),
        ...(user.isAnonymous === true ? { guest: true as const } : {}),
      };
    }
  }
  return denial(401, "unauthorized", "Invalid bearer token");
}
