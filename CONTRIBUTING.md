# Contributing

## Setup

Requires [Bun](https://bun.sh) 1.1+.

```bash
git clone https://github.com/in-th3-l00p/hermes-remote
cd hermes-remote
bun install
bun run --cwd packages/hermes-ts build
bun run --cwd packages/react-hermes build
```

## The rules

1. **100% coverage is the gate.** `bun run test` fails below 100% line and function coverage. New code lands with its tests; side effects go behind injectable seams (see the [engineering notes](https://hermes-remote.tiscacatalin.com/docs/internals/engineering.html)).
2. **Typecheck must pass.** `bun run typecheck` runs strict TypeScript across every package.
3. **Docs snippets are checked.** `bun scripts/check-snippets.ts` parses every ts/tsx fence in the docs; keep them valid.
4. **Integration tests** (`bun run test:integration`) need a live Hermes agent and are not required for every PR, but changes to the streaming path or auth should be exercised against one.
5. Commit messages are a few plain words. PRs against `main`; CI must be green.

## Where things live

| Path | Contents |
| ---- | -------- |
| `packages/hermes-api` | Server, CLI, auth, chat store |
| `packages/hermes-ts` | TypeScript client |
| `packages/react-hermes` | React hooks |
| `apps/chat` | Reference chat app |
| `apps/landing` | Site plus VitePress docs |
| `integration/` | Live stack tests |
