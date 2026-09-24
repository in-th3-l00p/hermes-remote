import { ProfileCreate, ProfileInstall, ProfilePatch } from "../openapi/schemas.ts";
import type { Hono } from "hono";
import { error, json, type ChatEnv } from "../chat/routes/shared.ts";
import { profileArgs } from "./registry.ts";
import {
  cliResponse,
  currentProfile,
  requireKeyScope,
  runCli,
  withUploadedArchive,
  type ManagementOptions,
} from "../mgmt/shared.ts";

// Names never start with "-", so a path segment can't become a CLI flag.
const NAME = ":name{[A-Za-z0-9_][A-Za-z0-9_-]*}";

export function registerProfileRoutes(app: Hono<ChatEnv>, options: ManagementOptions): void {
  const { cli, profiles } = options;

  app.get("/v1/profiles", async (c) => {
    const denied = requireKeyScope(c.get("principal"), "status:read");
    if (denied !== null) {
      return denied;
    }
    return json(200, { profiles: await profiles.list() });
  });

  app.get(`/v1/profiles/${NAME}`, (c) => {
    const denied = requireKeyScope(c.get("principal"), "status:read");
    return denied ?? runCli(c, cli, ["profile", "show", c.req.param("name")]);
  });

  app.post("/v1/profiles", async (c) => {
    const denied = requireKeyScope(c.get("principal"), "profiles:manage");
    if (denied !== null) {
      return denied;
    }
    const parsed = ProfileCreate.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      return error(400, "invalid_request", "name (string) is required");
    }
    return runCli(c, cli, ["profile", "create", parsed.data.name]);
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
    const parsed = ProfilePatch.safeParse(await c.req.json().catch(() => undefined));
    const body = parsed.success ? parsed.data : null;
    const name = c.req.param("name");
    if (body?.rename !== undefined) {
      return runCli(c, cli, ["profile", "rename", name, body.rename]);
    }
    if (body?.description !== undefined) {
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
    return new Response(result.stdoutBytes ?? result.stdout, {
      headers: { "content-type": "application/octet-stream" },
    });
  });

  app.post(`/v1/profiles/${NAME}/install`, async (c) => {
    const denied = requireKeyScope(c.get("principal"), "profiles:manage");
    if (denied !== null) {
      return denied;
    }
    const parsed = ProfileInstall.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      return error(400, "invalid_request", "source (string) is required");
    }
    const body = parsed.data;
    return runCli(c, cli, ["profile", "install", c.req.param("name"), body.source]);
  });

  app.post(`/v1/profiles/${NAME}/import`, async (c) => {
    const denied = requireKeyScope(c.get("principal"), "profiles:manage");
    if (denied !== null) {
      return denied;
    }
    return withUploadedArchive(c, (path) => runCli(c, cli, ["profile", "import", path], 300_000));
  });

  app.post(`/v1/profiles/${NAME}/update`, (c) => {
    const denied = requireKeyScope(c.get("principal"), "profiles:manage");
    return denied ?? runCli(c, cli, ["profile", "update", c.req.param("name")]);
  });
}
