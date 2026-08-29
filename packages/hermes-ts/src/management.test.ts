import { describe, expect, test } from "bun:test";
import { HermesClient } from "./client.ts";

interface Recorded {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

function makeClient(
  responder: (path: string) => Response = () => Response.json({ ok: true, raw: "" }),
): { client: HermesClient; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const client = new HermesClient({
    baseUrl: "http://x",
    token: "t",
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => {
        headers[k] = v;
      });
      calls.push({
        method: init?.method ?? "GET",
        path: String(url).replace("http://x", ""),
        body:
          init?.body === undefined ? undefined : JSON.parse(String(init?.body)),
        headers,
      });
      return responder(String(url).replace("http://x", ""));
    }) as unknown as typeof fetch,
  });
  return { client, calls };
}

type Call = [
  invoke: (client: HermesClient) => Promise<unknown>,
  method: string,
  path: string,
  body?: unknown,
];

const TABLE: Call[] = [
  [(c) => c.profiles.get("indra"), "GET", "/v1/profiles/indra"],
  [(c) => c.profiles.create("x"), "POST", "/v1/profiles", { name: "x" }],
  [(c) => c.profiles.remove("x"), "DELETE", "/v1/profiles/x"],
  [(c) => c.profiles.rename("x", "y"), "PATCH", "/v1/profiles/x", { rename: "y" }],
  [(c) => c.profiles.describe("x", "d"), "PATCH", "/v1/profiles/x", { description: "d" }],
  [(c) => c.profiles.importArchive("x", "/tmp/a.zip"), "POST", "/v1/profiles/x/import", { path: "/tmp/a.zip" }],
  [(c) => c.profiles.install("x", "https://g.it"), "POST", "/v1/profiles/x/install", { source: "https://g.it" }],
  [(c) => c.profiles.update("x"), "POST", "/v1/profiles/x/update"],
  [(c) => c.config.show(), "GET", "/v1/config"],
  [(c) => c.config.get("model"), "GET", "/v1/config/model"],
  [(c) => c.config.set("k", "v"), "PUT", "/v1/config/k", { value: "v" }],
  [(c) => c.config.unset("k"), "DELETE", "/v1/config/k"],
  [(c) => c.config.check(), "POST", "/v1/config/check"],
  [(c) => c.config.migrate(), "POST", "/v1/config/migrate"],
  [(c) => c.providers.model(), "GET", "/v1/providers/model"],
  [(c) => c.providers.setModel("m"), "PUT", "/v1/providers/model", { model: "m" }],
  [(c) => c.providers.fallbacks(), "GET", "/v1/providers/fallbacks"],
  [(c) => c.providers.setFallbacks("a,b"), "PUT", "/v1/providers/fallbacks", { chain: "a,b" }],
  [(c) => c.providers.moa(), "GET", "/v1/providers/moa"],
  [(c) => c.providers.setMoa("s"), "PUT", "/v1/providers/moa", { slots: "s" }],
  [(c) => c.providers.auth(), "GET", "/v1/providers/auth"],
  [(c) => c.agent.status(), "GET", "/v1/agent/status"],
  [(c) => c.agent.doctor(), "GET", "/v1/agent/doctor"],
  [(c) => c.agent.promptSize(), "GET", "/v1/agent/prompt-size"],
  [(c) => c.agent.securityAudit(), "GET", "/v1/agent/security-audit"],
  [(c) => c.agent.insights({ days: 7 }), "GET", "/v1/insights?days=7"],
  [(c) => c.agent.logs({ tail: 5, source: "gateway" }), "GET", "/v1/logs?tail=5&source=gateway"],
  [(c) => c.agent.pause(), "POST", "/v1/agent/pause"],
  [(c) => c.agent.resume(), "POST", "/v1/agent/resume"],
  [(c) => c.memory.get(), "GET", "/v1/memory"],
  [(c) => c.memory.set("m"), "PUT", "/v1/memory", { content: "m" }],
  [(c) => c.memory.user(), "GET", "/v1/memory/user"],
  [(c) => c.memory.setUser("u"), "PUT", "/v1/memory/user", { content: "u" }],
  [(c) => c.memory.add("t"), "POST", "/v1/memory/entries", { action: "add", text: "t" }],
  [(c) => c.memory.replace("a", "b"), "POST", "/v1/memory/entries", { action: "replace", from: "a", text: "b" }],
  [(c) => c.memory.remove("t"), "POST", "/v1/memory/entries", { action: "remove", text: "t" }],
  [(c) => c.memory.journey(), "GET", "/v1/memory/journey"],
  [(c) => c.memory.providers(), "GET", "/v1/memory/providers"],
  [(c) => c.memory.setProvider("mem0"), "PUT", "/v1/memory/providers", { provider: "mem0" }],
  [(c) => c.soul.get(), "GET", "/v1/soul"],
  [(c) => c.soul.set("s"), "PUT", "/v1/soul", { content: "s" }],
  [(c) => c.soul.skins(), "GET", "/v1/soul/skins"],
  [(c) => c.soul.setSkin("neo"), "PUT", "/v1/soul/skin", { name: "neo" }],
  [(c) => c.skills.list(), "GET", "/v1/skills"],
  [(c) => c.skills.get("s"), "GET", "/v1/skills/s"],
  [(c) => c.skills.create("s", "#"), "POST", "/v1/skills", { name: "s", content: "#" }],
  [(c) => c.skills.patch("s", "#2"), "PATCH", "/v1/skills/s", { content: "#2" }],
  [(c) => c.skills.remove("s"), "DELETE", "/v1/skills/s"],
  [(c) => c.skills.file("s", "refs/a.md"), "GET", "/v1/skills/s/files/refs/a.md"],
  [(c) => c.skills.writeFile("s", "refs/a.md", "x"), "PUT", "/v1/skills/s/files/refs/a.md", { content: "x" }],
  [(c) => c.skills.pending(), "GET", "/v1/skills/pending"],
  [(c) => c.skills.approve("1"), "POST", "/v1/skills/pending/1/approve"],
  [(c) => c.skills.reject("1"), "POST", "/v1/skills/pending/1/reject"],
  [(c) => c.skills.hubSearch("q", "official"), "GET", "/v1/skills/hub/search?q=q&source=official"],
  [(c) => c.skills.hubInstall("pdf"), "POST", "/v1/skills/hub/install", { source: "pdf" }],
  [(c) => c.skills.update("s"), "POST", "/v1/skills/s/update"],
  [(c) => c.skills.uninstall("s"), "POST", "/v1/skills/s/uninstall"],
  [(c) => c.skills.audit("s"), "POST", "/v1/skills/s/audit"],
  [(c) => c.skills.taps(), "GET", "/v1/skills/hub/taps"],
  [(c) => c.skills.addTap("https://t"), "POST", "/v1/skills/hub/taps", { url: "https://t" }],
  [(c) => c.skills.removeTap("t"), "DELETE", "/v1/skills/hub/taps/t"],
  [(c) => c.skills.curator(), "GET", "/v1/skills/curator"],
  [(c) => c.skills.curatorRun(), "POST", "/v1/skills/curator/run"],
  [(c) => c.skills.curatorPause(), "POST", "/v1/skills/curator/pause"],
  [(c) => c.bundles.get("b"), "GET", "/v1/bundles/b"],
  [(c) => c.bundles.put("b", "y"), "PUT", "/v1/bundles/b", { content: "y" }],
  [(c) => c.bundles.remove("b"), "DELETE", "/v1/bundles/b"],
  [(c) => c.checkpoints.list(), "GET", "/v1/checkpoints"],
  [(c) => c.checkpoints.prune(), "POST", "/v1/checkpoints/prune"],
  [(c) => c.approvals.history(), "GET", "/v1/approvals"],
  [(c) => c.approvals.propose(), "POST", "/v1/approvals/proposals"],
  [(c) => c.hooks.list(), "GET", "/v1/hooks"],
  [(c) => c.hooks.doctor(), "GET", "/v1/hooks/doctor"],
  [(c) => c.hooks.test("agent:start"), "POST", "/v1/hooks/agent:start/test"],
  [(c) => c.hooks.revokeConsent("rm"), "POST", "/v1/hooks/consent/revoke", { command: "rm" }],
  [(c) => c.webhooks.list(), "GET", "/v1/webhooks/subscriptions"],
  [(c) => c.webhooks.add("https://w"), "POST", "/v1/webhooks/subscriptions", { url: "https://w" }],
  [(c) => c.webhooks.remove("1"), "DELETE", "/v1/webhooks/subscriptions/1"],
  [(c) => c.gateway.status(), "GET", "/v1/gateway"],
  [(c) => c.gateway.platforms(), "GET", "/v1/gateway/platforms"],
  [(c) => c.gateway.start(), "POST", "/v1/gateway/start"],
  [(c) => c.gateway.stop(), "POST", "/v1/gateway/stop"],
  [(c) => c.gateway.restart(), "POST", "/v1/gateway/restart"],
  [(c) => c.gateway.enroll(), "POST", "/v1/gateway/enroll"],
  [(c) => c.gateway.setPlatform("telegram", "enabled", "true"), "PUT", "/v1/gateway/platforms/telegram", { key: "enabled", value: "true" }],
  [(c) => c.messaging.send("hi", { platform: "telegram", target: "ops" }), "POST", "/v1/messages/send", { message: "hi", platform: "telegram", target: "ops" }],
  [(c) => c.pairing.list(), "GET", "/v1/pairing/codes"],
  [(c) => c.pairing.create(), "POST", "/v1/pairing/codes"],
  [(c) => c.pairing.revoke("abc"), "DELETE", "/v1/pairing/codes/abc"],
  [(c) => c.kanban.tasks(), "GET", "/v1/kanban/tasks"],
  [(c) => c.kanban.add("fix", { description: "d" }), "POST", "/v1/kanban/tasks", { title: "fix", description: "d" }],
  [(c) => c.kanban.update("7", { status: "done" }), "PATCH", "/v1/kanban/tasks/7", { status: "done" }],
  [(c) => c.kanban.remove("7"), "DELETE", "/v1/kanban/tasks/7"],
  [(c) => c.kanban.comment("7", "nice"), "POST", "/v1/kanban/tasks/7/comments", { text: "nice" }],
  [(c) => c.projects.list(), "GET", "/v1/projects"],
  [(c) => c.projects.add("app"), "POST", "/v1/projects", { name: "app" }],
  [(c) => c.projects.update("app", { path: "/x" }), "PATCH", "/v1/projects/app", { path: "/x" }],
  [(c) => c.projects.remove("app"), "DELETE", "/v1/projects/app"],
  [(c) => c.toolsets.list(), "GET", "/v1/toolsets"],
  [(c) => c.toolsets.set("cli", "web", true), "PUT", "/v1/toolsets/cli", { name: "web", enabled: true }],
  [(c) => c.mcp.list(), "GET", "/v1/mcp"],
  [(c) => c.mcp.add("gh", "https://m"), "POST", "/v1/mcp", { name: "gh", url: "https://m" }],
  [(c) => c.mcp.remove("gh"), "DELETE", "/v1/mcp/gh"],
  [(c) => c.plugins.list(), "GET", "/v1/plugins"],
  [(c) => c.plugins.enable("p"), "POST", "/v1/plugins/p/enable"],
  [(c) => c.plugins.disable("p"), "POST", "/v1/plugins/p/disable"],
  [(c) => c.plugins.validate("p"), "POST", "/v1/plugins/p/validate"],
  [(c) => c.backups.importArchive("/tmp/b.zip"), "POST", "/v1/backups/import", { path: "/tmp/b.zip" }],
  [(c) => c.subagents.list(), "GET", "/v1/subagents"],
  [(c) => c.agentSessions.list(), "GET", "/v1/agent/sessions"],
  [(c) => c.agentSessions.create({ title: "t" }), "POST", "/v1/agent/sessions", { title: "t" }],
  [(c) => c.agentSessions.get("s1"), "GET", "/v1/agent/sessions/s1"],
  [(c) => c.agentSessions.update("s1", { title: "u" }), "PATCH", "/v1/agent/sessions/s1", { title: "u" }],
  [(c) => c.agentSessions.remove("s1"), "DELETE", "/v1/agent/sessions/s1"],
  [(c) => c.agentSessions.messages("s1"), "GET", "/v1/agent/sessions/s1/messages"],
  [(c) => c.agentSessions.fork("s1"), "POST", "/v1/agent/sessions/s1/fork", {}],
  [(c) => c.agentSessions.modelLock("s1", "m"), "POST", "/v1/agent/sessions/s1/model", { model: "m" }],
  [(c) => c.agentSessions.chat("s1", "hi"), "POST", "/v1/agent/sessions/s1/chat", { message: "hi" }],
  [(c) => c.commands.list(), "GET", "/v1/commands"],
  [(c) => c.commands.run("s1", "/goal status"), "POST", "/v1/agent/sessions/s1/commands", { command: "/goal status" }],
  [(c) => c.goals.get("s1"), "GET", "/v1/agent/sessions/s1/goal"],
  [(c) => c.goals.set("s1", "ship it", { draft: true }), "PUT", "/v1/agent/sessions/s1/goal", { text: "ship it", draft: true }],
  [(c) => c.goals.clear("s1"), "DELETE", "/v1/agent/sessions/s1/goal"],
  [(c) => c.goals.pause("s1"), "POST", "/v1/agent/sessions/s1/goal/pause"],
  [(c) => c.goals.resume("s1"), "POST", "/v1/agent/sessions/s1/goal/resume"],
  [(c) => c.goals.wait("s1", 12, "compile"), "POST", "/v1/agent/sessions/s1/goal/wait", { pid: 12, reason: "compile" }],
  [(c) => c.goals.unwait("s1"), "POST", "/v1/agent/sessions/s1/goal/unwait"],
  [(c) => c.goals.gates("s1"), "GET", "/v1/agent/sessions/s1/goal/gates"],
  [(c) => c.goals.addGate("s1", "bun test"), "POST", "/v1/agent/sessions/s1/goal/gates", { command: "bun test" }],
  [(c) => c.goals.removeGate("s1", 2), "DELETE", "/v1/agent/sessions/s1/goal/gates/2"],
  [(c) => c.goals.clearGates("s1"), "DELETE", "/v1/agent/sessions/s1/goal/gates"],
  [(c) => c.goals.subgoals("s1"), "GET", "/v1/agent/sessions/s1/goal/subgoals"],
  [(c) => c.goals.addSubgoal("s1", "docs"), "POST", "/v1/agent/sessions/s1/goal/subgoals", { text: "docs" }],
  [(c) => c.goals.removeSubgoal("s1", 1), "DELETE", "/v1/agent/sessions/s1/goal/subgoals/1"],
  [(c) => c.goals.clearSubgoals("s1"), "DELETE", "/v1/agent/sessions/s1/goal/subgoals"],
  [(c) => c.media.images("a cat", "flux"), "POST", "/v1/media/images", { prompt: "a cat", model: "flux" }],
  [(c) => c.web.search("bun"), "POST", "/v1/web/search", { query: "bun" }],
  [(c) => c.web.extract("https://bun.sh"), "POST", "/v1/web/extract", { url: "https://bun.sh" }],
  [(c) => c.browser.task("screenshot"), "POST", "/v1/browser/tasks", { task: "screenshot" }],
];

describe("client namespaces", () => {
  test("every method maps to its route", async () => {
    for (const [invoke, method, path, body] of TABLE) {
      const { client, calls } = makeClient();
      await invoke(client);
      expect(calls).toHaveLength(1);
      expect(`${calls[0]?.method} ${calls[0]?.path}`).toBe(`${method} ${path}`);
      expect(calls[0]?.body).toEqual(body);
    }
  });

  test("list unwrappers", async () => {
    const { client } = makeClient((path) =>
      path === "/v1/profiles"
        ? Response.json({ profiles: [{ name: "indra" }] })
        : Response.json({ bundles: [{ name: "b", content: "y" }] }),
    );
    expect((await client.profiles.list())[0]?.name).toBe("indra");
    expect((await client.bundles.list())[0]?.name).toBe("b");
  });

  test("raw responses come back untouched", async () => {
    const { client } = makeClient(() =>
      new Response("BYTES", {
        headers: { "content-type": "application/octet-stream" },
      }),
    );
    expect(await (await client.profiles.exportArchive("indra")).text()).toBe("BYTES");
    expect(await (await client.backups.create()).text()).toBe("BYTES");
    expect(await (await client.media.tts({ input: "hi" })).text()).toBe("BYTES");
    expect(
      await (await client.passthrough.chatCompletions({ messages: [] })).text(),
    ).toBe("BYTES");
    expect(await (await client.passthrough.responses({ input: "x" })).text()).toBe(
      "BYTES",
    );
  });

  test("streams parse SSE frames", async () => {
    const sse = () =>
      new Response(
        'event: run.started\ndata: {"a":1}\n\nevent: run.completed\ndata: {"b":2}\n\n',
        { headers: { "content-type": "text/event-stream" } },
      );
    const { client } = makeClient(sse);
    const collected = [];
    for await (const event of client.agentSessions.chatStream("s1", "hi")) {
      collected.push(event.event);
    }
    expect(collected).toEqual(["run.started", "run.completed"]);
    const events = [];
    for await (const event of client.events.subscribe()) {
      events.push(event.event);
    }
    expect(events).toEqual(["run.started", "run.completed"]);
  });

  test("withProfile pins every request to a profile", async () => {
    const { client, calls } = makeClient();
    const pinned = client.withProfile("indra");
    await pinned.agent.status();
    expect(calls[0]?.headers["x-hermes-profile"]).toBe("indra");
    await client.agent.status();
    expect(calls[1]?.headers["x-hermes-profile"]).toBeUndefined();
  });
});
