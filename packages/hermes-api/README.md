# @intheloop-studio/hermes-remote

Authenticated web API server for a local [Hermes agent](https://hermes-agent.nousresearch.com) instance. Part of [hermes-remote](https://github.com/in-th3-l00p/hermes-remote).

Requires the [Bun](https://bun.sh) runtime. The management CLI ships separately as `@intheloop-studio/hermes-remote-cli`.

## Install

```
npm i @intheloop-studio/hermes-remote
```

## Usage

```
hermes-api keys create --name my-app --scope chat:invoke --scope sessions:read
hermes-api keys list
hermes-api keys grant <id> --scope sessions:write
hermes-api keys ungrant <id> --scope sessions:write
hermes-api keys revoke <id>
hermes-api serve --port 8643
hermes-api logs --tail 100
```

Keys are scoped and restrictive by default: dangerous host-level scopes (config, hooks, skill installs, …) require an explicit `--dangerous` acknowledgment, and `--user-grantable` accepts end-user-safe scopes only.

State lives in `~/.hermes-api/` (override with `HERMES_API_HOME`).

## Client

Use [`@intheloop-studio/hermes-remote-client`](https://www.npmjs.com/package/@intheloop-studio/hermes-remote-client) or [`@intheloop-studio/hermes-remote-react`](https://www.npmjs.com/package/@intheloop-studio/hermes-remote-react) to consume the API.
