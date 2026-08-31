# Profiles architecture

A Hermes host can run many isolated agent instances: separate souls,
memories, config, sessions. hermes-remote multiplexes all of them through one
server with a single request header, and this example makes the switch
visible.

## One header, scoped clients

```ts
const client = new HermesClient({ baseUrl, token: API_KEY });
const work = client.withProfile("work");
```

`withProfile` returns a *new* client whose every request carries
`X-Hermes-Profile: work`, streams included. The page keeps the selected
profile in React state and derives the scoped client with `useMemo`, then
passes it to ordinary hooks:

```tsx
const scoped = useMemo(() => base.withProfile(selected), [selected]);
const soul = useSoul({ client: scoped });
const memory = useMemory({ client: scoped });
```

Nothing about the hooks is profile-aware. They re-run because the client
reference changed; the `key={selected}` on the panel container additionally
remounts the subtree so stale panels never flash. That is the entire
integration: profile switching is a client-construction concern, not a
per-call parameter threaded through your app.

## What the server does

The profile middleware resolves the header on every request: unknown profiles
404 before any work happens, and API keys minted with `--profile` are pinned:
a key restricted to `work` gets 403 `profile_forbidden` anywhere else. After
resolution, the CLI bridge prepends `-p <profile>` to its commands and the
filesystem bridge re-roots into that profile's home, which is why SOUL.md and
MEMORY.md visibly change when you click between the work and research profiles.

## The registry

`useProfiles` reads `GET /v1/profiles`, which is backed by a
`ProfileRegistry` that parses `hermes profile list` output (cached briefly,
since profile lists change rarely and requests don't). The hosted demo seeds three
profiles with deliberately different personalities so the retargeting is
obvious; on a real host you'd see your actual instances, gateways and all.
