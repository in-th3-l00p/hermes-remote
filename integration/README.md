# Integration suite

End to end tests that exercise hermes-remote over real HTTP: auth, scoped
keys, SSE streaming, session persistence, discovery, and the management
routes. Run them whenever hermes-remote changes.

## Local mode (default)

No setup. The harness boots a real hermes-remote server in-process, backed by
the built-in demo agent, the demo upstream, and a fake CLI bridge over a
throwaway profile home. This runs anywhere, including CI.

```sh
bun run test:integration:local
```

## Live mode

Targets a running hermes-remote server wired to a real Hermes agent. Set
three variables:

```sh
HERMES_INTEGRATION=1 \
HERMES_REMOTE_URL=http://localhost:8643 \
HERMES_REMOTE_TOKEN=hk_yourkey.yoursecret \
bun run test:integration
```

The token needs at least chat:invoke, sessions:read, sessions:write,
status:read, config:read, memory:read, and events:subscribe. Live mode is the
one that validates the CLI argv templates against the installed hermes
version; run it after upgrading the agent.

## Layout

`harness.ts` owns target selection and the local stack. Each `*.test.ts` file
covers one surface and gets its client from the harness, so new suites are a
`startStack()` call away. Coverage collection is off here on purpose (see
bunfig.toml); the 100 percent gate applies to the unit tests in `packages/`.
