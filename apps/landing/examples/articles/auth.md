# Auth architecture

hermes-remote authenticates every request into one of three principals, and
this example lets you *be* each of them. The page keeps three clients around,
same API but different credentials:

```ts
const anonymous = new HermesClient({ baseUrl });
const keyed = new HermesClient({ baseUrl, token: API_KEY });
const user = new HermesClient({
  baseUrl,
  tokenProvider: async () => currentToken,
});
```

This hosted example runs on built-in demo data in your browser, so it mints
the user token locally instead of signing in to a provider. In a real
deployment the tokenProvider reads the access token from your identity
provider (Supabase, Clerk, or any JWT issuer). Everything below is what the
real server does with that token.

## tokenProvider, not token

The user client never stores a token. `tokenProvider` is called before every
request, so the current access token is attached each time, and when a request
still comes back 401 (an expired token racing a refresh), the client fetches a
new token and retries exactly once. Static tokens don't get the retry:
replaying an identical credential can't succeed.

## What the server does with the JWT

hermes-remote verifies user tokens with the zero-dependency `jwt` provider
against your issuer's JWKS endpoint: pure Web Crypto, no SDK, no shared secret
on the server. For a Supabase project that is one line:

```ts
new JwtAuthProvider({
  jwksUrl: "https://<project>.supabase.co/auth/v1/.well-known/jwks.json",
})
```

The verified claims become the principal: `sub` owns your sessions, `email`
(when present) reaches the agent's identity context, and nothing else does.
Swap this one line for `SupabaseAuthProvider`, `ClerkAuthProvider`, or your
own `AuthProvider` implementation and the rest of the server is unchanged.
That is the providers module doing its job.

## The scope table

The probe panel replays five GETs with whichever principal you selected:

| request | anonymous | user | API key |
| ------- | --------- | ---- | ----------- |
| `/v1/auth/whoami` | 200 | 200 | 200 |
| `/v1/models` | 200 | 200 | 200 |
| `/v1/memory` | 403 | 403 | 200 |
| `/v1/agent/status` | 403 | 403 | 200 |
| `/v1/jobs` | 403 | 403 | 200 |

The pattern to notice: tier-1 reads (discovery, chat, your own sessions) pass
for everyone, while management surfaces (agent status, memory, jobs) return
403 `api_key_required` for user and anonymous principals no matter what. User
tokens are *never* management credentials in hermes-remote. There is also no
admin scope to leak: administration happens on the host CLI, and every
API key holds an explicit, finite scope list.

## The key in the hosted example

A real deployment mints keys with the CLI (`hermes-remote keys create`) and
treats them as secrets. The hosted example runs on built-in demo data inside
your browser, so it bakes a throwaway key into the page purely to demonstrate
the API-key tier; there is nothing behind it to protect, and the probe table
above behaves exactly as it would against a real server.
