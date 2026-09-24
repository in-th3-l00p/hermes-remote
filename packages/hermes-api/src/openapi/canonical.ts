import { tmpdir } from "node:os";
import { FakeCliBridge } from "../bridge/index.ts";
import { ChatStore } from "../chat/index.ts";
import { createApp } from "../http/app.ts";
import { ProfileRegistry } from "../profiles/registry.ts";
import { DemoUpstream } from "../upstream/demo.ts";
import { UserStore, UserTokenIssuer, newSigningSecret } from "../users/index.ts";

/**
 * The OpenAPI document with every surface enabled, built on inert backends.
 * This is what `bun scripts/openapi.ts` writes and the snapshot test checks.
 */
export async function canonicalOpenApi(): Promise<Record<string, unknown>> {
  const cli = new FakeCliBridge();
  const upstream = new DemoUpstream();
  const app = createApp({
    anonymous: true,
    chat: { store: new ChatStore(), agent: upstream.chat },
    upstream: { upstream },
    management: {
      cli,
      profiles: new ProfileRegistry({ cli, homeFor: tmpdir }),
      homeFor: tmpdir,
    },
    users: { store: new UserStore(), issuer: new UserTokenIssuer(newSigningSecret()) },
  });
  const res = await app.fetch(new Request("http://spec/v1/openapi.json"));
  return (await res.json()) as Record<string, unknown>;
}
