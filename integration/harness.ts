/**
 * Integration test harness.
 *
 * Every suite gets its target from startStack(), which supports two modes:
 *
 * live mode
 *   Set HERMES_INTEGRATION=1 and point HERMES_REMOTE_URL and
 *   HERMES_REMOTE_TOKEN at a running hermes-remote server wired to a real
 *   Hermes agent. Nothing is started or stopped by the harness.
 *
 * local mode (the default)
 *   The harness boots a real hermes-remote server in this process, backed by
 *   the built-in demo agent, the demo upstream, and a fake CLI bridge over a
 *   throwaway profile home. The full HTTP surface (auth, scopes, SSE
 *   streaming, management routes) is exercised without a Hermes agent, so
 *   this mode runs anywhere, including CI on every pull request.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ChatStore,
  DemoAgent,
  DemoUpstream,
  FakeCliBridge,
  KeyStore,
  ProfileRegistry,
  startServer,
  TIER1_SCOPES,
  TIER2_SCOPES,
  TIER3_SCOPES,
  type Scope,
} from "@intheloop-studio/hermes-remote";

export interface TestStack {
  mode: "live" | "local";
  baseUrl: string;
  /** Bearer token for authenticated clients; undefined only in live mode. */
  token: string | undefined;
  stop(): Promise<void>;
}

export const live = process.env["HERMES_INTEGRATION"] === "1";

export async function startStack(): Promise<TestStack> {
  if (live) {
    return {
      mode: "live",
      baseUrl: process.env["HERMES_REMOTE_URL"] ?? "http://localhost:8643",
      token: process.env["HERMES_REMOTE_TOKEN"],
      async stop() {},
    };
  }
  return startLocalStack();
}

export async function startLocalStack(): Promise<TestStack> {
  const home = await mkdtemp(join(tmpdir(), "hermes-remote-itest-"));
  const profileHome = join(home, "profile-default");
  await mkdir(join(profileHome, "memories"), { recursive: true });
  await writeFile(
    join(profileHome, "memories", "MEMORY.md"),
    "- prefers short answers\n",
  );
  await writeFile(join(profileHome, "memories", "USER.md"), "- a test user\n");
  await writeFile(join(profileHome, "SOUL.md"), "You are a helpful agent.\n");

  const keys = new KeyStore(join(home, "keys.json"));
  const scopes: Scope[] = [
    ...TIER1_SCOPES,
    ...TIER2_SCOPES,
    ...TIER3_SCOPES,
  ];
  const { token } = await keys.create({ name: "integration", scopes });

  const cli = new FakeCliBridge({
    "profile list": {
      stdout: [
        "name       home",
        "──────────────────",
        `◆ default    ${profileHome}`,
      ].join("\n"),
    },
    status: { stdout: "hermes 0.20.x\ngateway: running\n" },
    "config show": { stdout: "model:\n  provider: demo\n" },
  });
  const homeFor = (): string => profileHome;

  const server = await startServer({
    port: 0,
    logPath: join(home, "logs", "server.log"),
    store: keys,
    chat: {
      store: new ChatStore(":memory:"),
      agent: new DemoAgent(),
      turns: new Map(),
    },
    upstream: { upstream: new DemoUpstream() },
    management: {
      cli,
      profiles: new ProfileRegistry({ cli, homeFor }),
      homeFor,
    },
  });

  return {
    mode: "local",
    baseUrl: `http://127.0.0.1:${server.port}`,
    token,
    async stop() {
      server.stop();
      await rm(home, { recursive: true, force: true });
    },
  };
}
