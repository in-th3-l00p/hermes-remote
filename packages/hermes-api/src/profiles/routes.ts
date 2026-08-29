import type { Hono } from "hono";
import { error, json, requireScope, type ChatEnv } from "../chat/routes/shared.ts";
import { profileArgs } from "./registry.ts";
import {
  cliResponse,
  currentProfile,
  invalidParam,
  requireKeyScope,
  runCli,
  type ManagementOptions,
} from "../mgmt/shared.ts";

const NAME = ":name{[A-Za-z0-9_-]+}";

export function registerProfileRoutes(
  app: Hono<ChatEnv>,
  options: ManagementOptions,
): void {
  const { cli, profiles } = options;

  app.get("/v1/profiles", async (c) => {
    const denied = requireScope(c.get("principal"), "status:read");
    if (denied !== null) {
      return denied;
    }
    return json(200, { profiles: await profiles.list() });
  });

  app.get(`/v1/profiles/${NAME}`, (c) => {
    const denied = requireScope(c.get("principal"), "status:read");
    return denied ?? runCli(c, cli, ["profile", "show", c.req.param("name")]);
  });

  app.post("/v1/profiles", async (c) => {
    const denied = requireKeyScope(c.get("principal"), "profiles:manage");
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => null)) as { name?: unknown } | null;
    const name = body?.name;
    if (typeof name !== "string" || name === "" || invalidParam(name)) {
      return error(400, "invalid_request", "name (string) is required");
    }
    return runCli(c, cli, ["profile", "create", name]);
  });

  app.delete(`/v1/profiles/${NAME}`, (c) => {
    const denied = requireKeyScope(c.get("principal"), "profiles:manage");
    return denied ?? runCli(c, cli, ["profile", "delete", c.req.param("name")]);
  });

  app.patch(`/v1/profiles/${NAME}`, async (c) => {
    const denied = requireKeyScope(c.get("principal"), "profiles:manage");
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => null)) as {
      rename?: unknown;
      description?: unknown;
    } | null;
    const name = c.req.param("name");
    if (typeof body?.rename === "string" && !invalidParam(body.rename)) {
      return runCli(c, cli, ["profile", "rename", name, body.rename]);
    }
    if (typeof body?.description === "string" && !invalidParam(body.description)) {
      return runCli(c, cli, ["profile", "describe", name, body.description]);
    }
    return error(400, "invalid_request", "rename or description is required");
  });

  app.post(`/v1/profiles/${NAME}/export`, async (c) => {
    const denied = requireKeyScope(c.get("principal"), "profiles:manage");
    if (denied !== null) {
      return denied;
    }
    const result = await cli.run([
      ...profileArgs(currentProfile(c)),
      "profile",
      "export",
      c.req.param("name"),
    ]);
    if (!result.ok) {
      return cliResponse(result);
    }
    return new Response(result.stdout, {
      headers: { "content-type": "application/octet-stream" },
    });
  });

  app.post(`/v1/profiles/${NAME}/install`, async (c) => {
    const denied = requireKeyScope(c.get("principal"), "profiles:manage");
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => null)) as { source?: unknown } | null;
    if (typeof body?.source !== "string" || invalidParam(body.source)) {
      return error(400, "invalid_request", "source (string) is required");
    }
    return runCli(c, cli, [
      "profile",
      "install",
      c.req.param("name"),
      body.source,
    ]);
  });

  app.post(`/v1/profiles/${NAME}/import`, async (c) => {
    const denied = requireKeyScope(c.get("principal"), "profiles:manage");
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => null)) as { path?: unknown } | null;
    if (typeof body?.path !== "string" || invalidParam(body.path)) {
      return error(400, "invalid_request", "path (server-local string) is required");
    }
    return runCli(c, cli, ["profile", "import", body.path]);
  });

  app.post(`/v1/profiles/${NAME}/update`, (c) => {
    const denied = requireKeyScope(c.get("principal"), "profiles:manage");
    return denied ?? runCli(c, cli, ["profile", "update", c.req.param("name")]);
  });
}
