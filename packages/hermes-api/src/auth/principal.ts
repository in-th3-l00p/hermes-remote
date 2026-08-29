import { ipInCidr } from "../limits/index.ts";
import type { AuthProvider } from "./providers/index.ts";
import type { ApiKeyRecord } from "./keys.ts";

export interface KeyVerifier {
  verifyToken(token: string): Promise<ApiKeyRecord | null>;
}

export type Principal =
  | { type: "api_key"; record: ApiKeyRecord }
  | { type: "user"; userId: string; email?: string }
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
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
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
  if (options.authProvider !== undefined) {
    const user = await options.authProvider.verify(token);
    if (user !== null) {
      return {
        type: "user",
        userId: user.sub,
        ...(user.email === undefined ? {} : { email: user.email }),
      };
    }
  }
  return denial(401, "unauthorized", "Invalid bearer token");
}
