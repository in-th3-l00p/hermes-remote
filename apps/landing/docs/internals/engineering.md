# Engineering practices

## The monorepo

Bun workspaces: four packages (server, CLI, client, react), two apps (chat, this site), one integration suite. One strict `tsconfig` base (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), builds via `bun build` for JS plus `tsc` for declarations, with a `bun` export condition so workspace consumers resolve source while npm consumers get `dist`.

## The 100% coverage gate

`bunfig.toml` sets `coverageThreshold = 1.0`; every `bun test` run fails below 100% line and function coverage. What makes that sustainable rather than performative:

* Every side effect sits behind an injectable seam: `fetch` is a constructor option, clocks are `now()` parameters, the CLI takes a context object with `homeDir`, `env`, `platform`, and a `serve` function, the CLI bridge takes a spawn seam. Unit tests never touch the network or the real home directory.
* The agent is an interface (`AgentBackend`, plus the `Upstream` facade and the bridge interfaces), each with a real implementation and a fake. Route tests run against a two-line echo agent, error paths against a throwing one, cancellation against a gated one.
* Integration tests live outside the coverage scope in `integration/`, gated by `HERMES_INTEGRATION=1`, and exercise the real chain: a live Hermes agent, real user tokens, real cancellation.

## The two test tiers

* **Unit tests** (`packages/*`, `bun run test`): no external dependencies; the Hermes backend is mocked or faked. This is the tier the coverage gate applies to.
* **Integration tests** (`integration/`, `bun run test:integration`): require a running Hermes agent and a running hermes-remote, selected by `HERMES_INTEGRATION=1` plus `HERMES_REMOTE_URL` and `HERMES_REMOTE_TOKEN`. Kept in separate files so they skip cleanly when no instance is available.

## SSE on both ends

The server emits events by writing into a `ReadableStream`; the client parses with a small incremental parser that buffers partial frames across chunk boundaries. The same parser handles the upstream agent's OpenAI-style stream. Both parsers are tested with deliberately split chunks, because that is exactly what networks do.

## Lessons learned

Real bugs found and fixed along the way, kept here so they stay fixed:

* Browsers throw "Illegal invocation" if you store `fetch` and call it detached from `window`; bind it (`globalThis.fetch.bind(globalThis)`).
* Bun's coverage counts implicit class constructors as uncoverable functions; classes in covered code get explicit constructors.
* Vite's dependency prebundle can duplicate React after adding a dependency mid-flight; `resolve.dedupe: ["react", "react-dom"]` plus clearing `node_modules/.vite` fixes it.
* npm silently rejects brand-new package names containing a dot (the PUT returns 404), which is why the client package is not called `hermes.ts`.
* happy-dom's global registration replaces `fetch` for every later test file in the process; unregister in `afterAll`.
* Supabase projects created in 2026 sign access tokens with ES256 signing keys, not the legacy HS256 secret; verify via JWKS, not the dashboard secret.

## CI

Two GitHub Actions workflows: `test` (install, build clients, typecheck, `bun test packages` with the coverage gate, parse-check every ts/tsx snippet in these docs) on every push and PR, and `release` on `v*` tags (test, build, publish all four packages to npm under the `@intheloop-studio` scope, attach tarballs to an auto-generated GitHub release).
