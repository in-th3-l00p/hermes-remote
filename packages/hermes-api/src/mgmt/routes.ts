import type { Context, Hono } from "hono";
import { error, requireScope, type ChatEnv } from "../chat/routes/shared.ts";
import { isUserGrantableScope } from "../scopes/index.ts";
import { profileArgs } from "../profiles/registry.ts";
import { MGMT_ROUTES, type CliRouteSpec } from "./catalog.ts";
import {
  cliResponse,
  currentProfile,
  invalidParam,
  requireKeyScope,
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
      parsedBody ??= (await c.req.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      value = parsedBody?.[p.name];
    }
    if (value === undefined || value === null || value === "") {
      if (p.required === true) {
        return error(400, "invalid_request", `${p.name} is required`);
      }
      continue;
    }
    const text = String(value);
    if (invalidParam(text)) {
      return error(400, "invalid_request", `${p.name} must not start with "-"`);
    }
    values[p.name] = text;
  }
  return values;
}

export function buildArgv(
  spec: CliRouteSpec,
  values: Record<string, string>,
): string[] {
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
    const guard = isUserGrantableScope(spec.scope)
      ? requireScope
      : requireKeyScope;
    const denied = guard(c.get("principal"), spec.scope);
    if (denied !== null) {
      return denied;
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

export function registerMgmtRoutes(
  app: Hono<ChatEnv>,
  options: ManagementOptions,
): void {
  for (const spec of MGMT_ROUTES) {
    app[spec.method](spec.path, cliHandler(spec, options));
  }

  app.put("/v1/toolsets/:platform", async (c) => {
    const denied = requireKeyScope(c.get("principal"), "toolsets:manage");
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => null)) as {
      name?: unknown;
      enabled?: unknown;
    } | null;
    if (
      typeof body?.name !== "string" ||
      body.name === "" ||
      invalidParam(body.name) ||
      typeof body.enabled !== "boolean"
    ) {
      return error(400, "invalid_request", "name (string) and enabled (boolean) are required");
    }
    return cliResponse(
      await options.cli.run([
        ...profileArgs(currentProfile(c)),
        "tools",
        body.enabled ? "enable" : "disable",
        body.name,
      ]),
    );
  });

  app.post("/v1/backups", async (c) => {
    const denied = requireKeyScope(c.get("principal"), "backups:manage");
    if (denied !== null) {
      return denied;
    }
    const result = await options.cli.run(
      [...profileArgs(currentProfile(c)), "backup"],
      { timeoutMs: 300_000 },
    );
    if (!result.ok) {
      return cliResponse(result);
    }
    return new Response(result.stdout, {
      headers: { "content-type": "application/octet-stream" },
    });
  });
}
