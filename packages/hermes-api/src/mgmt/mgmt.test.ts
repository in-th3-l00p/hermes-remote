import { describe, expect, test } from "bun:test";
import { FakeCliBridge } from "../bridge/index.ts";
import { createApp, ProfileRegistry, type KeyVerifier } from "../index.ts";
import type { ApiKeyRecord } from "../auth/index.ts";
import { MGMT_ROUTES, buildArgv, type CliRouteSpec } from "./index.ts";

const PROFILE_TABLE = ` Profile  Model  Gateway  Alias  Distribution
 ─────
 ◆default   m   running   —   —
`;

function keyStore(scopes: string[]): KeyVerifier {
  const record: ApiKeyRecord = {
    id: "abc123",
    name: "ops",
    hash: "h",
    scopes,
    userGrantable: [],
    createdAt: "2026-08-23T00:00:00.000Z",
    expiresAt: null,
    revoked: false,
  };
  return { verifyToken: async (t) => (t === "hk_good" ? record : null) };
}

function makeApp(fake: FakeCliBridge, store?: KeyVerifier, anonymous = false) {
  return createApp({
    anonymous,
    ...(store === undefined ? {} : { store }),
    management: {
      cli: fake,
      profiles: new ProfileRegistry({
        cli: fake,
        homeFor: (n) => `/homes/${n}`,
      }),
      homeFor: () => "/homes/default",
    },
  });
}

function sampleValues(spec: CliRouteSpec): Record<string, string> {
  const values: Record<string, string> = {};
  for (const p of spec.params ?? []) {
    values[p.name] = `v${p.name.replace(/[^a-z]/g, "")}1`;
  }
  return values;
}

function samplePath(spec: CliRouteSpec, values: Record<string, string>): string {
  let path = spec.path.replace(
    /:(\w+)(\{[^}]*\})?/g,
    (_m, name: string) => values[name] ?? "x",
  );
  const query = (spec.params ?? [])
    .filter((p) => p.from === "query")
    .map((p) => `${p.name}=${values[p.name]}`)
    .join("&");
  if (query !== "") {
    path += `?${query}`;
  }
  return path;
}

function sampleRequest(
  spec: CliRouteSpec,
  values: Record<string, string>,
  token?: string,
): Request {
  const bodyEntries = (spec.params ?? []).filter((p) => p.from === "body");
  const hasBody = bodyEntries.length > 0 && spec.method !== "get";
  return new Request(`http://x${samplePath(spec, values)}`, {
    method: spec.method.toUpperCase(),
    headers: {
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...(hasBody ? { "content-type": "application/json" } : {}),
    },
    ...(hasBody
      ? {
          body: JSON.stringify(
            Object.fromEntries(bodyEntries.map((p) => [p.name, values[p.name]])),
          ),
        }
      : {}),
  });
}

describe("management catalog", () => {
  test("every route: scope denial, argv wiring, cli failure", async () => {
    for (const spec of MGMT_ROUTES) {
      const values = sampleValues(spec);
      const expected = buildArgv(spec, values);
      const good = new FakeCliBridge({ "profile list": { stdout: PROFILE_TABLE } });
      good.on(expected.join(" "), { stdout: `done:${spec.path}` });
      const app = makeApp(good, keyStore([spec.scope]));
      const res = await app.fetch(sampleRequest(spec, values, "hk_good"));
      expect(`${spec.method} ${spec.path} ${res.status}`).toBe(
        `${spec.method} ${spec.path} 200`,
      );
      expect(await res.json()).toEqual({ ok: true, raw: `done:${spec.path}` });
      expect(good.calls.at(-1)).toEqual(expected);

      const denied = makeApp(good, keyStore(["sessions:search"]));
      expect(
        (await denied.fetch(sampleRequest(spec, values, "hk_good"))).status,
      ).toBe(403);

      const failing = new FakeCliBridge({
        "profile list": { stdout: PROFILE_TABLE },
      });
      failing.on(expected.join(" "), { exitCode: 3, stderr: "nope" });
      const failApp = makeApp(failing, keyStore([spec.scope]));
      const failed = await failApp.fetch(sampleRequest(spec, values, "hk_good"));
      expect(failed.status).toBe(502);
    }
  }, 60_000);

  test("exact argv for representative routes", async () => {
    const fake = new FakeCliBridge({
      "profile list": { stdout: PROFILE_TABLE },
      "config set model.name gpt": { stdout: "set" },
      "send hello --platform telegram --to ops": { stdout: "sent" },
      "insights --days 7": { stdout: "usage" },
    });
    const app = makeApp(
      fake,
      keyStore(["config:write", "messaging:send", "insights:read"]),
    );
    const put = await app.fetch(
      new Request("http://x/v1/config/model.name", {
        method: "PUT",
        headers: {
          authorization: "Bearer hk_good",
          "content-type": "application/json",
        },
        body: JSON.stringify({ value: "gpt" }),
      }),
    );
    expect(put.status).toBe(200);
    const send = await app.fetch(
      new Request("http://x/v1/messages/send", {
        method: "POST",
        headers: {
          authorization: "Bearer hk_good",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: "hello",
          platform: "telegram",
          target: "ops",
        }),
      }),
    );
    expect(send.status).toBe(200);
    const insights = await app.fetch(
      new Request("http://x/v1/insights?days=7", {
        headers: { authorization: "Bearer hk_good" },
      }),
    );
    expect(insights.status).toBe(200);
  });

  test("missing required params and dash injection are rejected", async () => {
    const fake = new FakeCliBridge({ "profile list": { stdout: PROFILE_TABLE } });
    const app = makeApp(fake, keyStore(["config:write", "messaging:send"]));
    const missing = await app.fetch(
      new Request("http://x/v1/config/some.key", {
        method: "PUT",
        headers: {
          authorization: "Bearer hk_good",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(missing.status).toBe(400);
    const dash = await app.fetch(
      new Request("http://x/v1/messages/send", {
        method: "POST",
        headers: {
          authorization: "Bearer hk_good",
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "--yolo" }),
      }),
    );
    expect(dash.status).toBe(400);
  });

  test("tier-two surfaces reject user and anonymous principals", async () => {
    const fake = new FakeCliBridge({
      "profile list": { stdout: PROFILE_TABLE },
      status: { stdout: "fine" },
    });
    const app = makeApp(fake, undefined, true);
    const kanban = await app.fetch(new Request("http://x/v1/kanban/tasks"));
    expect(kanban.status).toBe(403);
    expect(((await kanban.json()) as { error: { code: string } }).error.code).toBe(
      "api_key_required",
    );
    const status = await app.fetch(new Request("http://x/v1/agent/status"));
    expect(status.status).toBe(200);
  });

  test("toolsets switch between enable and disable", async () => {
    const fake = new FakeCliBridge({
      "profile list": { stdout: PROFILE_TABLE },
      "tools enable web": { stdout: "on" },
      "tools disable web": { stdout: "off" },
    });
    const app = makeApp(fake, keyStore(["toolsets:manage"]));
    const putToolset = (enabled: boolean) =>
      app.fetch(
        new Request("http://x/v1/toolsets/cli", {
          method: "PUT",
          headers: {
            authorization: "Bearer hk_good",
            "content-type": "application/json",
          },
          body: JSON.stringify({ name: "web", enabled }),
        }),
      );
    expect(await (await putToolset(true)).json()).toEqual({ ok: true, raw: "on" });
    expect(await (await putToolset(false)).json()).toEqual({ ok: true, raw: "off" });
    const invalid = await app.fetch(
      new Request("http://x/v1/toolsets/cli", {
        method: "PUT",
        headers: {
          authorization: "Bearer hk_good",
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "web" }),
      }),
    );
    expect(invalid.status).toBe(400);
  });

  test("backups stream the archive or map failures", async () => {
    const fake = new FakeCliBridge({
      "profile list": { stdout: PROFILE_TABLE },
      backup: { stdout: "ZIPBYTES" },
    });
    const app = makeApp(fake, keyStore(["backups:manage"]));
    const backup = await app.fetch(
      new Request("http://x/v1/backups", {
        method: "POST",
        headers: { authorization: "Bearer hk_good" },
      }),
    );
    expect(backup.headers.get("content-type")).toBe("application/octet-stream");
    expect(await backup.text()).toBe("ZIPBYTES");
    const failing = new FakeCliBridge({
      "profile list": { stdout: PROFILE_TABLE },
      backup: { exitCode: 1, stderr: "disk full" },
    });
    const failApp = makeApp(failing, keyStore(["backups:manage"]));
    expect(
      (
        await failApp.fetch(
          new Request("http://x/v1/backups", {
            method: "POST",
            headers: { authorization: "Bearer hk_good" },
          }),
        )
      ).status,
    ).toBe(502);
    const anonymous = makeApp(fake, undefined, true);
    expect(
      (
        await anonymous.fetch(
          new Request("http://x/v1/backups", { method: "POST" }),
        )
      ).status,
    ).toBe(403);
  });
});
