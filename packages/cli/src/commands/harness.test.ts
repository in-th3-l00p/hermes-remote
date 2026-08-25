import { expect } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../run.ts";
import type { CliContext, ServeRequest } from "../context.ts";

export async function makeCtx(): Promise<{
  ctx: CliContext;
  serveCalls: ServeRequest[];
}> {
  const homeDir = await mkdtemp(join(tmpdir(), "hermes-api-cli-"));
  const serveCalls: ServeRequest[] = [];
  const ctx: CliContext = {
    homeDir,
    platform: "darwin",
    execPath: "/test/bun",
    entryPath: "/test/cli.ts",
    now: () => new Date("2026-08-23T00:00:00Z"),
    env: {},
    which: (name) => `/test/bin/${name}`,
    serve: async (request) => {
      serveCalls.push(request);
      return { port: request.port === 0 ? 12345 : request.port };
    },
  };
  return { ctx, serveCalls };
}

export async function createKey(
  ctx: CliContext,
  extra: string[] = [],
): Promise<string> {
  const result = await runCli(
    ["keys", "create", "--name", "ci", "--scope", "chat:invoke", ...extra],
    ctx,
  );
  expect(result.exitCode).toBe(0);
  return (result.output.match(/^([0-9a-f]+) /m) ??
    result.output.match(/created key ([0-9a-f]+)/))?.[1] as string;
}
