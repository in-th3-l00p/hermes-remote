# hermes-web-api

Authenticated web API and management CLI for a local [Hermes agent](https://hermes-agent.nousresearch.com) instance. Part of [hermes-web](https://github.com/in-th3-l00p/hermes-web).

Requires the [Bun](https://bun.sh) runtime.

## Install

```
npm i -g hermes-web-api
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

Use [`hermes-web-ts`](https://www.npmjs.com/package/hermes-web-ts) or [`hermes-web-react`](https://www.npmjs.com/package/hermes-web-react) to consume the API.
