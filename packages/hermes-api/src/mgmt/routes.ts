import { ToolsetToggle } from "../openapi/schemas.ts";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Context, Hono } from "hono";
import { error, type ChatEnv } from "../chat/routes/shared.ts";
import { profileArgs } from "../profiles/registry.ts";
import { MGMT_ROUTES, type CliRouteSpec } from "./catalog.ts";
import {
  cliResponse,
  currentProfile,
  invalidParam,
  requireKeyScope,
  withUploadedArchive,
  type ManagementOptions,
} from "./shared.ts";

async function resolveParams(
  c: Context<ChatEnv>,
  spec: CliRouteSpec,
): Promise<Record<string, string> | Response> {
  const values: Record<string, string> = {};
  let parsedBody: Record<string, unknown> | null | undefined;
  for (const p of spec.params ?? []) {
    let value: unknown;
    if (p.from === "param") {
      value = c.req.param(p.name);
    } else if (p.from === "query") {
      value = c.req.query(p.name);
    } else {
      parsedBody ??= (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
      value = parsedBody?.[p.name];
    }
    if (value === undefined || value === null || value === "") {
      if (p.required === true) {
        return error(400, "invalid_request", `${p.name} is required`);
      }
      continue;
    }
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      return error(400, "invalid_request", `${p.name} must be a string, number or boolean`);
    }
    const text = String(value);
    if (invalidParam(text)) {
      return error(400, "invalid_request", `${p.name} must not start with "-"`);
    }
    values[p.name] = text;
  }
  return values;
}

export function buildArgv(spec: CliRouteSpec, values: Record<string, string>): string[] {
  const argv = spec.argv.map((token) =>
    token.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? ""),
  );
  for (const p of spec.params ?? []) {
    const value = values[p.name];
    if (p.flag !== undefined && value !== undefined) {
      argv.push(p.flag, value);
    }
  }
  return argv;
}

function cliHandler(spec: CliRouteSpec, options: ManagementOptions) {
  return async (c: Context<ChatEnv>): Promise<Response> => {
    const denied = requireKeyScope(c.get("principal"), spec.scope);
    if (denied !== null) {
      return denied;
    }
    if (spec.unsupported !== undefined) {
      return error(501, "not_supported", spec.unsupported);
    }
    const values = await resolveParams(c, spec);
    if (values instanceof Response) {
      return values;
    }
    const argv = [...profileArgs(currentProfile(c)), ...buildArgv(spec, values)];
    return cliResponse(
      await options.cli.run(argv, {
        ...(spec.timeoutMs === undefined ? {} : { timeoutMs: spec.timeoutMs }),
      }),
    );
  };
}

export function registerMgmtRoutes(app: Hono<ChatEnv>, options: ManagementOptions): void {
  for (const spec of MGMT_ROUTES) {
    app[spec.method](spec.path, cliHandler(spec, options));
  }

  app.put("/v1/toolsets/:platform", async (c) => {
    const denied = requireKeyScope(c.get("principal"), "toolsets:manage");
    if (denied !== null) {
      return denied;
    }
    const parsed = ToolsetToggle.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      return error(400, "invalid_request", "name (string) and enabled (boolean) are required");
    }
    const body = parsed.data;
    return cliResponse(
      await options.cli.run([
        ...profileArgs(currentProfile(c)),
        "tools",
        body.enabled ? "enable" : "disable",
        body.name,
      ]),
    );
  });

  app.post("/v1/backups/import", async (c) => {
    const denied = requireKeyScope(c.get("principal"), "backups:manage");
    return (
      denied ??
      withUploadedArchive(c, async (path) =>
        cliResponse(
          // -f: the CLI would otherwise wait for an interactive confirmation.
          await options.cli.run([...profileArgs(currentProfile(c)), "import", path, "-f"], {
            timeoutMs: 300_000,
          }),
        ),
      )
    );
  });

  app.post("/v1/backups", async (c) => {
    const denied = requireKeyScope(c.get("principal"), "backups:manage");
    if (denied !== null) {
      return denied;
    }
    // `hermes backup` writes a zip file rather than stdout: point it at a
    // private temp path, stream the file back, and remove it.
    const dir = await mkdtemp(join(tmpdir(), "hermes-remote-backup-"));
    const path = join(dir, "backup.zip");
    try {
      const result = await options.cli.run(
        [...profileArgs(currentProfile(c)), "backup", "-o", path],
        { timeoutMs: 300_000 },
      );
      if (!result.ok) {
        return cliResponse(result);
      }
      const archive = await readFile(path).catch(() => null);
      if (archive === null) {
        return error(502, "cli_error", "hermes backup did not write an archive");
      }
      return new Response(archive, {
        headers: {
          "content-type": "application/zip",
          "content-disposition": 'attachment; filename="hermes-backup.zip"',
        },
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
