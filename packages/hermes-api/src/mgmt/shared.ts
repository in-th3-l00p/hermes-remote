import type { Context } from "hono";
import { error, requireScope, type ChatEnv } from "../chat/routes/shared.ts";
import type { CliBridge, CliResultData } from "../bridge/index.ts";
import type { Principal } from "../auth/index.ts";
import type { ProfileRegistry } from "../profiles/registry.ts";
import { profileArgs } from "../profiles/registry.ts";

export interface ManagementOptions {
  cli: CliBridge;
  profiles: ProfileRegistry;
  homeFor: (profile: string | null) => string;
}

/** Management surfaces are operator territory: api keys only, exact scope. */
export function requireKeyScope(
  principal: Principal,
  scope: string,
): Response | null {
  if (principal.type !== "api_key") {
    return error(403, "api_key_required", "This surface requires an API key");
  }
  return requireScope(principal, scope);
}

export function cliResponse(result: CliResultData): Response {
  if (result.ok) {
    return Response.json({ ok: true, raw: result.stdout });
  }
  const message = (result.stderr.trim() || result.stdout.trim()).slice(-2000);
  return Response.json(
    { error: { code: "cli_error", message, exitCode: result.exitCode } },
    { status: 502 },
  );
}

export function invalidParam(value: string): boolean {
  return value.startsWith("-");
}

export function currentProfile(c: Context<ChatEnv>): string | null {
  return c.get("profile") ?? null;
}

export async function runCli(
  c: Context<ChatEnv>,
  cli: CliBridge,
  argv: string[],
): Promise<Response> {
  return cliResponse(
    await cli.run([...profileArgs(currentProfile(c)), ...argv]),
  );
}
