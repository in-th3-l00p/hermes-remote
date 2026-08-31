# Configuration architecture

This example edits three very different things (YAML config, bounded memory
files, and the agent's SOUL.md) through one client, because the server hides
the mechanics behind uniform routes. Under the hood it exercises both of
hermes-remote's management bridges.

## Two bridges, one response shape

Config operations run through the **CLI bridge**: the server executes the
`hermes` binary with allowlisted argv (never a shell), and returns whatever
the CLI printed:

```ts
const shown = await client.config.show();   // { ok: true, raw: "model:\n  provider: nous…" }
await client.config.set("model.name", "…"); // hermes config set model.name …
```

The `{ ok, raw }` shape is deliberate: hermes-remote does not re-model every
CLI output format. When a command fails, the route returns 502 `cli_error`
with the exit code, so errors stay diagnosable end to end.

Memory and soul go through the **filesystem bridge** instead: the server reads
and writes `memories/MEMORY.md`, `memories/USER.md`, and `SOUL.md` inside the
profile home directly, with a path allowlist and a hard denylist (`.env`,
`auth.json`, key material) enforced below the route layer.

## Memory is a budget, not a database

```ts
const memory = useMemory({ client });        // { content, chars, limit: 2200 }
await client.memory.add("prefers dark mode");
await client.memory.replace("old line", "new line");
await client.memory.remove("stale entry");
```

The char meters in the UI mirror the real constraint: MEMORY.md injects into
the agent's system prompt, so it is capped (2,200 chars; USER.md 1,375). The
server rejects writes past the budget with 400 `memory_overflow`, the same
force-consolidation pressure the real agent's `memory` tool experiences.

## Hooks over one generic

`useConfig`, `useMemory`, and `useSoul` are each a few lines over a shared
`useResource(fetcher, deps)` primitive that owns loading/error/refresh state:

```tsx
const config = useConfig({ client });  // { data, loading, error, refresh }
const soul = useSoul({ client });
```

Mutations call the client namespace directly, then `refresh()`. The hooks
stay read-models, which keeps every panel's data flow one-directional and
trivially testable.

## Scoping

Everything on this page requires an API key: `config:read/write`,
`memory:read/write`, and `soul:read/write` are tier-2/3 scopes, denied to
anonymous visitors and signed-in users alike. Open the auth example to watch
those denials happen live.
