# Compatibility

## Hermes agent

Hermes Remote is developed and tested against **Hermes Agent 0.20.x**. It talks to the agent three ways, and each has its own compatibility story:

| Bridge | What it uses | If the agent changes it |
| ------ | ------------ | ----------------------- |
| HTTP | The agent's built-in API server: `/v1/chat/completions`, `/v1/runs`, `/v1/models`, `/v1/capabilities`, `/v1/skills`, `/v1/toolsets`, `/api/model/options`, `/api/sessions`, `/api/jobs` | The route answers 502 `upstream_error` with the agent's status. |
| CLI | `hermes <command>` for the [management routes](/api/management), with argv checked against the published CLI reference | The route answers 502 `cli_error`, and `raw` carries the CLI's own complaint. A missing binary answers 503 `cli_unavailable`. |
| Files | The profile home (`~/.hermes` or `~/.hermes/profiles/<name>`): memory, soul, skills, cron output, and `state.db` for goal state | Reads fail with 404 or 502; nothing is written outside the CLI. |

Chat, sessions, runs, jobs and discovery need only the HTTP API server (`API_SERVER_ENABLED=true`). The management routes also need the `hermes` binary on the server's host, and goals need read access to the profile's `state.db`.

The routes the CLI reference does not describe in detail (`profile`, `plugins` and `tools` subcommands, `mcp add`) are the most likely to drift. After upgrading the agent, run `hermes-remote doctor` and call a few management routes you depend on before exposing the upgrade.

## Runtimes

| Package | Runtime |
| ------- | ------- |
| Server and CLI | Bun 1.3 or later. CI tests 1.3.0 and the pinned current release. |
| TypeScript client | Browsers, Bun, and Node 18 or later. |
| React hooks | React 18 or 19, in any of the client's runtimes. |

## Client and server versions

The client's major version moves when the HTTP API changes incompatibly. Use the client from the same release line as the server:

| Server (`hermes-remote`, `hermes-remote-cli`) | Client and React hooks |
| --------------------------------------------- | ---------------------- |
| 4.x | 2.x |
| 3.3 | 1.3 |
| 3.2 | 1.2 |

Every release's changes, including breaking ones, are in the [changelog](https://github.com/in-th3-l00p/hermes-remote/blob/main/CHANGELOG.md).
