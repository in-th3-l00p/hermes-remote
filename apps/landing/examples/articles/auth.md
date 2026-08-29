# Auth — architecture

hermes-remote authenticates every request into one of three principals, and
this example lets you *be* each of them. The page keeps three clients around —
same API, different credentials:

```ts
const anonymous = new HermesClient({ baseUrl });
const keyed = new HermesClient({ baseUrl, token: SANDBOX_KEY });
const user = new HermesClient({
  baseUrl,
  tokenProvider: async () =>
    (await supabase.auth.getSession()).data.session?.access_token ?? "",
});
```

## tokenProvider, not token

The user client never stores a token. `tokenProvider` is called before every
request, so a fresh Supabase access token is attached each time — and when a
request still comes back 401 (an expired token racing a refresh), the client
fetches a new token and retries exactly once. Static tokens don't get the
retry: replaying an identical credential can't succeed.

## What the server does with the JWT

The sandbox verifies Supabase tokens with the zero-dependency `jwt` provider
against the project's JWKS endpoint — pure Web Crypto, no SDK, no shared
secret on the server:

```ts
new JwtAuthProvider({
  jwksUrl: "https://<project>.supabase.co/auth/v1/.well-known/jwks.json",
})
```

The verified claims become the principal: `sub` owns your sessions, `email`
(when present) reaches the agent's identity context, and nothing else does.
Swap this one line for `SupabaseAuthProvider`, `ClerkAuthProvider`, or your
own `AuthProvider` implementation and the rest of the server is unchanged —
that is the providers module doing its job.

## The scope table

The probe panel replays five GETs with whichever principal you selected:

| request | anonymous | user | sandbox key |
| ------- | --------- | ---- | ----------- |
| `/v1/auth/whoami` | 200 | 200 | 200 |
| `/v1/models` | 200 | 200 | 200 |
| `/v1/memory` | 403 | 403 | 200 |
| `/v1/agent/status` | 200 | 200 | 200 |
| `/v1/jobs` | 403 | 403 | 200 |

The pattern to notice: tier-1 scopes (`status:read`, discovery, chat) pass
for everyone, while management surfaces (`memory:read`, `crons:read`) return
403 `api_key_required` for user and anonymous principals no matter what — user
tokens are *never* management credentials in hermes-remote. There is also no
admin scope to leak: administration happens on the host CLI, and even the
sandbox's public API key holds an explicit, finite scope list.

## Why the sandbox key is public

A real deployment mints keys with the CLI (`hermes-remote keys create`) and
treats them as secrets. The sandbox bakes one deliberately public key into the
page so you can experience the API-key tier; its scope list excludes anything
destructive, and the whole sandbox is rate-limited, ephemeral state.
