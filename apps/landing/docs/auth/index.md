# 2.1 Authentication overview

Every request to Hermes Remote is authenticated into a *principal* before anything else happens. There are three kinds:

| Principal | Token | Granted |
| --------- | ----- | ------- |
| API key | `Bearer hk_<id>.<secret>` | Exactly the scopes minted on the key |
| User | `Bearer <jwt>` from your auth provider | Tier 1 scopes, own sessions only |
| Anonymous | none (only with `--anonymous`) | Tier 1, sessions addressed by id |

API keys are managed by the CLI (`hermes-remote keys`) and never minted over HTTP. User tokens are verified by an **auth provider** — the subject of this section.

## Auth providers

A provider turns a bearer token into a verified identity:

```ts
import type { AuthProvider, VerifiedUser } from "@in-th3-l00p/hermes-remote";

interface Example extends AuthProvider {
  readonly name: string;
  verify(token: string): Promise<VerifiedUser | null>;
}

type Verified = VerifiedUser; // { sub: string; email?: string; isAnonymous?: boolean }
```

Three providers ship in the box, selected by the `auth` section of `~/.hermes-remote/config.json`:

| Provider | Backed by | Config |
| -------- | --------- | ------ |
| [`supabase`](/auth/supabase) | official `@supabase/supabase-js` | `{ "provider": "supabase", "url": "...", "publishableKey": "..." }` |
| [`clerk`](/auth/clerk) | official `@clerk/backend` | `{ "provider": "clerk", "secretKey": "sk_..." }` |
| [`jwt`](/auth/custom) | nothing (built in) | `{ "provider": "jwt", "jwksUrl": "..." }` or `{ "provider": "jwt", "hs256Secret": "..." }` |

Anything else — Auth0, Firebase, your own backend — plugs in either through the generic `jwt` provider (if it issues standard JWTs) or by [implementing the interface yourself](/auth/custom).

## Optional SDKs

The SDK-backed providers keep their SDKs as *optional peer dependencies*: nothing is installed or loaded unless you enable that provider. Enable `supabase` or `clerk` and the server dynamically imports the SDK on first use; if it is missing you get one clear error naming the package to install:

```bash
bun add @supabase/supabase-js   # only if auth.provider = "supabase"
bun add @clerk/backend          # only if auth.provider = "clerk"
```

Install it next to wherever `@in-th3-l00p/hermes-remote` runs (the project directory for embedded servers, `bun add -g` for a globally installed CLI). The zero-dependency `jwt` provider needs nothing.

## What the identity is used for

* **Ownership** — sessions created by a user belong to their `sub`; other users get 404s.
* **Identity injection** — every agent turn starts with a system message introducing the verified caller (user id, email if present, or the API key name). Only verified claims go in; the agent can answer "who am I?" from nothing else.
* **Rate limiting and audit** — limits are per principal, and mutations plus auth failures land in `~/.hermes-remote/audit.log`.

## Selecting a provider

In `config.json`:

```json
{
  "auth": { "provider": "clerk", "secretKey": "sk_live_..." }
}
```

Or, when embedding the server as a library, pass any `AuthProvider` directly:

```ts
import { createApp, createAuthProvider } from "@in-th3-l00p/hermes-remote";

const authProvider = createAuthProvider({
  provider: "supabase",
  url: "https://project.supabase.co",
  publishableKey: "sb_publishable_...",
});

const app = createApp({ ...(authProvider === null ? {} : { authProvider }) });
```

The legacy `--supabase-url` / `--supabase-jwt-secret` flags still work and map onto the `jwt` provider; the `auth` section supersedes them.
