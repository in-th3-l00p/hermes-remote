# @in-th3-l00p/hermes-web-api

Authenticated web API and management CLI for a local [Hermes agent](https://hermes-agent.nousresearch.com) instance. Part of [hermes-web](https://github.com/in-th3-l00p/hermes-web).

Requires the [Bun](https://bun.sh) runtime.

## Install

Packages are published to GitHub Packages. Point the `@in-th3-l00p` scope at it once (a GitHub token with `read:packages` is required):

```
echo "@in-th3-l00p:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc
```

```
npm i -g @in-th3-l00p/hermes-web-api
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

Use [`@in-th3-l00p/hermes-web-ts`](https://github.com/in-th3-l00p/hermes-web/packages) or [`@in-th3-l00p/hermes-web-react`](https://github.com/in-th3-l00p/hermes-web/packages) to consume the API.
