# Hermes Remote: release plan

The project is renamed **Hermes Remote**. This document is the single checklist that takes the current state (working chat, secured API, Supabase auth, shadcn UI, 116 tests at 100% coverage) to a public release. Work is organized in five milestones; each has concrete tasks and a definition of done. Nothing ships until the milestone before it is green.

## Current state (baseline)

Done and verified end to end: streaming chat against a real Hermes agent, SQLite persisted sessions with per user ownership, API keys with tiered scopes via CLI, Supabase auth (GitHub OAuth, email OTP, anonymous guests) verified through JWKS, agent identity injection, shadcn UI for app and landing, GitHub Packages 0.1.0, landing live at hermes-web.tiscacatalin.com.

## Milestone 1: rename and branding

Goal: the product is consistently "Hermes Remote" everywhere, with a visual identity.

Naming decisions (proposed, confirm before executing):

* Product name: **Hermes Remote**. Lowercase wordmark "hermes remote" in UI.
* Tagline: **"Your Hermes agent, anywhere."** Long description: "Hermes Remote turns a local Hermes agent into a secure web product: an authenticated API, a typed TypeScript client, and React hooks, with streaming chat, persistent sessions, and user identity built in."
* GitHub repo: rename to `in-th3-l00p/hermes-remote` (GitHub redirects the old URL automatically).
* npm packages: `@in-th3-l00p/hermes-remote` (server and CLI, bin `hermes-remote`, keep `hermes-api` as an alias bin for one release), `@in-th3-l00p/hermes-remote-client`, `@in-th3-l00p/hermes-remote-react`. Old names get a final deprecation release pointing at the new ones.
* Domain: `hermes-remote.tiscacatalin.com` (the wildcard DNS already points at Vercel, so this is a Vercel domain add plus redirect from the old subdomain).

Tasks:

1. Repo rename on GitHub, update `repository` fields, badges, remotes.
2. Package renames across the monorepo (package.json names, bin, imports, externals, `.npmrc` scope docs), version bump to 0.2.0.
3. Logo: the four point star (the ✧ signature) as the mark. Deliverables: `assets/logo.svg` (geometric concave diamond star, monochrome, works in zinc light and dark), `assets/wordmark.svg`, favicon set, og image (1200x630) for landing and docs, README banner. Hand authored SVG, no external tooling required.
4. Apply branding: landing hero, app header and auth card, README, CLI help header, package descriptions.
5. Announcement X post (draft now, publish at launch, user posts it manually). Thread of three posts, plain language, no decoration:
   * Post 1 (hook + what it is): "I put my Hermes agent on the web. Hermes Remote is an open source bridge that turns a local Hermes agent into a real product: authenticated API, typed client, React hooks. Streaming chat, sessions, reactions, edits, attachments. One hook: useChat()." plus a 30 to 45 second screen recording of the chat app (sign in with GitHub, streaming markdown answer, reaction, edit, session switch).
   * Post 2 (security angle): "Every request is authorized. Scoped API keys for backends, Supabase JWTs for users (verified via JWKS, no shared secret), anonymous guests get stable identities, and the agent is told exactly who it is talking to."
   * Post 3 (links): repo, docs, quick start snippet (npm i, keys create, serve).
   * Assets needed: the recording (record with the chat app once M2 lands), og image.

Done when: no occurrence of "hermes-web" remains in user facing surfaces, new domain serves the landing, packages published under new names, X thread drafted in `assets/announcement.md`.

## Milestone 2: engineering completion and hardening

Goal: the framework is production credible, not just demo complete. Coverage stays at 100% throughout; every item lands with unit tests, and integration tests where a live agent is involved.

Server (`hermes-remote`):

1. Multi origin CORS (`--cors` accepts a comma list; echo the matching origin).
2. Turn cancellation: `POST /v1/sessions/:id/stop` aborts the in flight upstream stream (AbortController through HermesAgent), message finishes as `done` with partial content.
3. Limits: request body cap, attachment count and size caps, message length cap, configurable in one `limits` block.
4. Rate limiting per principal (token bucket in memory, headers on 429) and an append only audit log (`~/.hermes-remote/audit.log`) for auth failures, key usage, and session mutations.
5. Config file `~/.hermes-remote/config.json` loaded by `serve` so the long flag list becomes optional; flags override file; `hermes-remote init` writes it interactively.
6. Service management: `hermes-remote service install|start|stop|status` generating launchd (macOS) and systemd (Linux) units so the API survives reboots next to the agent gateway.
7. Session and message pagination (`?cursor` and `?limit`) to keep long histories cheap.
8. Key hygiene: `keys rotate` (new secret, same id and scopes), optional per key CIDR allowlist enforcement.

Client (`hermes-remote-client`):

9. Automatic retry on 401 via `tokenProvider` refresh (one retry), typed `HermesApiError` already in place.
10. `AbortSignal` support on streaming calls, wired to the new stop endpoint.

React (`hermes-remote-react`):

11. `useSessions()` hook (list, delete, refresh) so apps stop hand rolling the sidebar logic.
12. `stop()` on `useChat` plus `attachmentsPending` state.

Testing and CI:

13. Integration suite (`*.integration.test.ts`, gated by `HERMES_INTEGRATION=1`) covering: real agent turn, session round trip after server restart, Supabase token verify, key auth, stop endpoint.
14. GitHub Actions: `test` workflow (bun test with the 100% coverage gate plus typecheck on push and PR) and `release` workflow (on tag: build, pack, publish to GitHub Packages, attach tarballs to the GitHub release).
15. Authorization matrix test: one generated test iterating every route against every principal type asserting allow or deny, as specified in ARCHITECTURE.md.

Done when: all 15 items merged, CI green on a clean clone, integration suite passes against the local agent, coverage gate still at 100%.

## Milestone 3: documentation

Goal: a docs site at `hermes-remote.tiscacatalin.com/docs` (VitePress, static output copied into the landing deploy; consistent zinc theme, Geist fonts, the star mark).

Structure (chapters map to the sidebar):

Chapter 1, Projects. One subchapter per package, each with "how it works" and "how to use it":

* 1.1 The server and CLI (`hermes-remote`): architecture of the bridge (HTTP proxy to the agent's API server), the SQLite chat store, SSE protocol reference (event types with payload schemas), full CLI reference (serve, keys, logs, init, service), configuration reference (flags, env, config file), scope catalog with the four tiers.
* 1.2 The TypeScript client (`hermes-remote-client`): client construction, auth modes (API key, tokenProvider, anonymous), every method with signatures and examples, streaming iteration patterns, error handling.
* 1.3 The React hooks (`hermes-remote-react`): `useChat` and `useSessions` API reference, state shapes, the provider, SSR notes.

Chapter 2, Tutorials:

* 2.1 Build a chat app in React from zero (the apps/chat walkthrough, abbreviated): install, serve, useChat, markdown rendering, attachments, reactions, edits.
* 2.2 Authentication with Supabase: project setup, anonymous guests, email OTP, GitHub OAuth, how identity reaches the agent.
* 2.3 Custom auth providers: implementing `UserTokenVerifier` for any JWT issuer (Auth0, Clerk, Firebase, self issued), the HS256 and JWKS helpers, and the token exchange pattern from ARCHITECTURE.md for platforms with their own backends.
* 2.4 Deploying: running hermes-remote as a service next to the agent, exposing it (reverse proxy, TLS, tunnel options), locking down scopes and profiles, what never to expose.
* 2.5 Using the API without the client: curl and SSE from any language.

Chapter 3, How it was built (technical documentation):

* 3.1 Architecture decisions: the three bridge design, why the agent's own API server is the integration point, principal model and the no admin scope rule.
* 3.2 Security model: key hashing, tier system, JWKS verification and why asymmetric beats a shared secret, ownership enforcement, identity injection without data leakage.
* 3.3 Engineering practices: Bun monorepo layout, the 100% coverage gate and how fakes keep unit tests agent free, the SSE implementation on both ends, lessons learned (fetch binding, Bun implicit constructors in coverage, Vite duplicate React, npm dotted package names).

Tasks: scaffold VitePress in `apps/docs`, write the chapters (source most content from ARCHITECTURE.md, CLAUDE.md, and package READMEs, then verify every snippet compiles by extracting them into a doc test script), wire the build into the landing deploy, add Docs to the landing nav.

Done when: every public API symbol appears in the reference, every snippet is executed by the snippet checker in CI, docs deployed under the new domain.

## Milestone 4: release engineering

1. Version 1.0.0 across all packages once M2 and M3 are done (the API surface freezes at 1.0; anything experimental gets marked unstable in docs).
2. Changelog generation from commit history into `CHANGELOG.md`, GitHub release with notes and tarballs (automated by the release workflow from M2).
3. Final npm publish to GitHub Packages under the new names; deprecation release of the 0.x names with a README pointing at the new packages.
4. Repo polish: README rewritten around the new branding with the banner, a 60 second quick start, and the architecture diagram; add `SECURITY.md` (reporting contact plus the threat model summary from docs 3.2) and `CONTRIBUTING.md` (setup, test gate, PR rules).
5. Hosted demo decision: either deploy apps/chat publicly wired to the DemoAgent (safe, no real agent exposed) so the announcement has a clickable link, or ship only the recording. Recommendation: deploy the DemoAgent backed demo at `demo.hermes-remote.tiscacatalin.com`.

Done when: `v1.0.0` tag exists, CI published it, a clean machine can follow the README quick start successfully.

## Milestone 5: launch

1. Final pass on landing (new name, docs links, demo link).
2. Record the announcement video against the finished app.
3. Publish the X thread from `assets/announcement.md` (posted by the account owner, not automated).
4. Submit to the Hermes community channels (Nous Research Discord showcase, agentskills ecosystem if applicable) and add the project to the Hermes Agent integrations discussion.
5. Post release watch: triage issues for the first week, patch release policy (fix within days at 1.0.x).

## Order of execution and effort

M1 rename and branding: one focused session (the rename is mechanical, the logo and copy are the creative work).
M2 hardening: the largest block, roughly three sessions (server items 1 to 8, then clients, then CI and integration).
M3 documentation: two sessions (scaffold plus chapter 1 first, tutorials second; chapter 3 is mostly distillation of existing docs).
M4 release engineering: one session.
M5 launch: half a session plus the human steps (video recording, posting).

Hard dependencies: M1 before M3 (docs use the new names), M2 items 13 and 14 before M4, everything before M5. M1 and M2 can interleave if needed, but the rename should land before any new public artifact is produced.
