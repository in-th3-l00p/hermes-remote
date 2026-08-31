# Command center architecture

The showcase composes every hermes-remote surface into one dashboard. There
is deliberately no cleverness in the composition: five panels, each a
self-contained component owning its own hooks, sharing nothing but two client
instances.

## Two clients, many hooks

```ts
const client = new HermesClient({ baseUrl });                    // anonymous: chat + runs
const keyedClient = new HermesClient({ baseUrl, token: KEY });   // API key: management
```

The split mirrors the security model instead of hiding it. Conversational
surfaces (chat, runs) run as the anonymous visitor, so each visitor owns their
sessions and runs. Management surfaces (memory, soul, config, jobs, health,
events) require API-key scopes, so they use an API key.

## Panel by panel

| panel | hooks | routes underneath |
| ----- | ----- | ----------------- |
| chat | `useChat` | `/v1/sessions*` + SSE turns |
| runs | `useRuns`, `useRunEvents` | `/v1/runs*` + per-run SSE |
| memory + soul | `useMemory`, `useSoul` | FS bridge over MEMORY.md / SOUL.md |
| health · config · jobs | `useAgentInfo`, `useConfig`, `useJobsAdmin` | discovery proxy + CLI bridge + jobs proxy |
| event firehose | `useEvents` | `GET /v1/events` SSE |

Every read hook is the same shape, `{ data, loading, error, refresh }` from
the shared `useResource` primitive, so panels are interchangeable
scaffolding: pick a hook, render `data`, surface `error`, call `refresh()`
after mutations.

## The event ticker closes the loop

`useEvents` holds one long-lived SSE subscription to `/v1/events` (with an
`AbortController` cleanup on unmount). Send a chat message or launch a run and
watch `run.created` frames arrive in the ticker. This is the same push channel a
real operations dashboard would use instead of polling. The server publishes
these from an in-process event bus that route handlers feed as they work.

## Why this scales down and up

Nothing in this page knows it is running on the hosted demo data. Point the
two clients at a self-hosted hermes-remote (with a real key minted by
`hermes-remote keys create`) and the identical component tree
drives a full Hermes agent: real cron jobs in the jobs list, real CLI output
in the config panel, goals and profiles a hook away (`useGoal`,
`useProfiles`, shown in the other examples). The dashboard is the client
library's feature matrix, rendered.
