# 2.2 Supabase provider

Verifies Supabase access tokens with the official SDK (`supabase.auth.getClaims`), which checks signatures locally against your project's signing keys. One Supabase project gives you OAuth providers, email OTP, and anonymous guests with stable ids.

## Server

Install the SDK next to the server and select the provider:

```bash
bun add @supabase/supabase-js
```

```json
{
  "auth": {
    "provider": "supabase",
    "url": "https://YOUR_PROJECT.supabase.co",
    "publishableKey": "sb_publishable_..."
  }
}
```

The publishable (anon) key is not a secret — it is the same key your frontend uses. No Supabase secret is ever stored on the server.

Embedded instead of the CLI:

```ts
import { SupabaseAuthProvider, createApp } from "@in-th3-l00p/hermes-remote";

const app = createApp({
  authProvider: new SupabaseAuthProvider({
    url: "https://YOUR_PROJECT.supabase.co",
    publishableKey: "sb_publishable_...",
  }),
});
```

### Without the SDK

If you prefer zero extra dependencies, the built-in [`jwt` provider](/auth/custom) verifies the same tokens against your project's JWKS endpoint:

```json
{
  "auth": {
    "provider": "jwt",
    "jwksUrl": "https://YOUR_PROJECT.supabase.co/auth/v1/.well-known/jwks.json"
  }
}
```

This is exactly what the legacy `--supabase-url` flag configures. Projects still on a legacy shared HS256 secret use `{ "provider": "jwt", "hs256Secret": "..." }`.

## Client

```ts
import { createClient } from "@supabase/supabase-js";
import { HermesClient } from "@in-th3-l00p/hermes-remote-client";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const client = new HermesClient({
  baseUrl: "http://localhost:8643",
  tokenProvider: async () =>
    (await supabase.auth.getSession()).data.session?.access_token ?? "",
});
```

Sign in however your product wants — anonymous guests keep a stable `sub`, and can later be linked to an email or OAuth identity without losing their sessions:

```ts
await supabase.auth.signInAnonymously();
await supabase.auth.signInWithOtp({ email });
await supabase.auth.signInWithOAuth({ provider: "github" });
```

The identity the agent sees is `sub` plus `email` when present; anonymous sign-ins are introduced to the agent as guests with their stable id. See the [Supabase tutorial](/tutorials/supabase-auth) for the full walkthrough.
