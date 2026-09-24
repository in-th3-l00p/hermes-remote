# Token exchange

Use token exchange when your platform already has its own login (Auth0, Cognito, your own sessions) and you don't want hermes-remote to verify that provider's tokens directly. Your backend vouches for the user and hermes-remote mints a short-lived, scoped token for the browser.

```
End user ──login──► your platform
Your backend ──POST /v1/auth/token (hk_ key with auth:users)──► hermes-remote
             ◄── { token, expires_at, user }
Browser ──Bearer <token>──► hermes-remote
```

## Set up the platform key

The key your backend uses needs `auth:users`, which requires `--dangerous`, and a list of scopes it may hand out:

```bash
hermes-remote keys create --name platform --scope auth:users --dangerous \
  --user-grantable chat:invoke,sessions:read,sessions:write --expires 90d
```

A key can only grant scopes from its `--user-grantable` list, and only end-user scopes (`chat:invoke`, `sessions:read`, `sessions:write`, `sessions:search`, `status:read`, `skills:read`, `toolsets:read`). Anything else is refused with 403 `scope_not_grantable`. Keep this key on your backend; never ship it to browsers.

## Exchange

```bash
curl -s -X POST "$BASE/v1/auth/token" \
  -H "Authorization: Bearer $PLATFORM_KEY" -H "content-type: application/json" \
  -d '{
    "user": { "provider": "auth0", "subject": "auth0|abc123",
              "profile": { "name": "Ada" }, "agent_visibility": "pseudonymous" },
    "scopes": ["chat:invoke", "sessions:read", "sessions:write"],
    "ttl": 900
  }'
```

```json
{ "token": "eyJ...", "expires_at": "2026-09-24T12:15:00.000Z",
  "user": { "id": "usr_07a54c651a055be3f163", "identities": [{ "provider": "auth0", "subject": "auth0|abc123" }], "...": "..." } }
```

- The user is created on first exchange and found again by `(provider, subject)` afterwards. `profile`, `metadata` and `agent_visibility`, when sent, replace the stored values.
- `ttl` is 60 to 86,400 seconds (default 900). Refresh by exchanging again from your backend.
- The token works like any user token: sessions it creates belong to the user, and it holds exactly the granted scopes.

In the browser, hand the token to the client through a `tokenProvider` that calls your backend, so it refreshes on expiry:

```ts
import { HermesClient } from "@intheloop-studio/hermes-remote-client";

const client = new HermesClient({
  baseUrl: "https://agent.example.com",
  tokenProvider: async () => (await fetch("/api/hermes-token")).text(),
});
```

## What the agent learns

`agent_visibility` decides what goes into the identity turn at the start of every chat turn and run:

| Visibility | Agent is told |
| ---------- | ------------- |
| `anonymous` (default) | Only that it is talking to a platform user whose identity isn't shared |
| `pseudonymous` | The stable opaque user id, enough for continuity across sessions |
| `full` | The user id plus `name`, `locale`, `timezone` and `email` from the profile |

`metadata` is never shown to the agent; use it for your own bookkeeping.

## Managing users

All of these need an API key with `auth:users`:

| Route | Purpose |
| ----- | ------- |
| `GET /v1/users?limit=&offset=` | List users, with a `total` |
| `GET /v1/users/:id` | One user |
| `PATCH /v1/users/:id` | Body `{profile?, metadata?, agent_visibility?}` |
| `POST /v1/users/:id/disable` / `enable` | Disabling invalidates every outstanding token immediately; re-enabling does not revive them |
| `DELETE /v1/users/:id?cascade=true` | Delete the user, and with `cascade=true` their chat sessions |
| `POST /v1/users/:id/identities` | Body `{provider, subject}`: link another identity (409 if it belongs to someone else) |
| `DELETE /v1/users/:id/identities/:provider` | Unlink one (the last identity can't be removed) |

On the host, `hermes-remote users list|show|disable|enable|delete` does the same without a key.

## Signing key

Tokens are HS256 JWTs signed with `~/.hermes-remote/signing.key`, created on the first `serve` (mode 0600). Deleting that file and restarting invalidates every outstanding user token at once.
