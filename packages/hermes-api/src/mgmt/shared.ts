import type { Context } from "hono";
import { redact } from "./redact.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    return Response.json({ ok: true, raw: redact(result.stdout) });
  }
  if (result.unavailable === true) {
    return Response.json(
      {
        error: {
          code: "cli_unavailable",
          message: "The hermes CLI could not be started; check hermesBinary",
        },
      },
      { status: 503 },
    );
  }
  const message = redact(result.stderr.trim() || result.stdout.trim()).slice(-2000);
  return Response.json(
    { error: { code: "cli_error", message, exitCode: result.exitCode } },
    { status: 502 },
  );
}

/**
 * Writes the request body (an uploaded archive) to a private temp file,
 * hands its path to `run`, and removes it afterwards. Callers never name a
 * server-local path.
 */
export async function withUploadedArchive(
  c: Context<ChatEnv>,
  run: (path: string) => Promise<Response>,
): Promise<Response> {
  if ((c.req.header("content-type") ?? "").startsWith("application/json")) {
    return error(
      400,
      "invalid_request",
      "Upload the archive as the request body (application/octet-stream)",
    );
  }
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.byteLength === 0) {
    return error(400, "invalid_request", "An archive body is required");
  }
  const dir = await mkdtemp(join(tmpdir(), "hermes-remote-import-"));
  const path = join(dir, "archive");
  try {
    await writeFile(path, bytes, { mode: 0o600 });
    return await run(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
  timeoutMs?: number,
): Promise<Response> {
  return cliResponse(
    await cli.run(
      [...profileArgs(currentProfile(c)), ...argv],
      timeoutMs === undefined ? undefined : { timeoutMs },
    ),
  );
}
