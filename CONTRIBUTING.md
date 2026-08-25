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

## Code structure

1. **One concern per module.** A module is a directory (or a single small file) owning exactly one feature of the package: auth, chat, keys, limits, serve, ... Code that belongs to different concerns never shares a file.
2. **Small files.** Source files stay under ~200 lines. When a file grows past that, it is doing more than one job — split it along the seam.
3. **Public API only through `index.ts`.** Consumers (including sibling packages) import from the package root. Inside a package, modules import each other only through the sibling module's entry file, never deep into its internals.
4. **Dependency direction is one-way.** Shared primitives (types, scopes, limits) sit at the bottom; features import primitives; the composition root (app assembly, bin entry) imports features. Nothing imports upward and there are no cycles.
5. **Pure core, thin shell.** Parsing, validation, and decision logic are pure functions; I/O (Bun.serve, sqlite, fetch, fs, clock) enters through injectable seams at the edges. This is what keeps the 100% gate cheap.
6. **Tests live next to the code.** `foo.ts` is covered by `foo.test.ts` in the same directory, testing through the module's entry, not its internals, wherever practical.
7. **Comments state constraints, not narration.** Write a comment only for what the code cannot say (a protocol quirk, a security invariant). No section banners, no restating the next line.

## Where things live

| Path | Contents |
| ---- | -------- |
| `packages/hermes-api` | Server, auth, chat store |
| `packages/cli` | Management CLI (`hermes-remote`) |
| `packages/hermes-ts` | TypeScript client |
| `packages/react-hermes` | React hooks |
| `apps/chat` | Reference chat app |
| `apps/landing` | Site plus VitePress docs |
| `integration/` | Live stack tests |
