# 3.2 Authentication with Supabase

Hermes Remote verifies Supabase access tokens directly, so a Supabase project is a complete identity layer: OAuth providers, email OTP, and anonymous guests, all with stable user ids. Reference: [Authentication → Supabase provider](/auth/supabase).

## Server side

The quickest path needs no extra dependency — point the server at your project and drop `--anonymous`:

```bash
hermes-remote serve --supabase-url https://YOUR_PROJECT.supabase.co \
  --cors http://localhost:5173 \
  --upstream http://127.0.0.1:8642 --upstream-key $API_SERVER_KEY
```

Tokens are verified against the project's JWKS endpoint (`/auth/v1/.well-known/jwks.json`), so no Supabase secret is stored on the server. Projects still on the legacy HS256 secret can pass `--supabase-jwt-secret` instead.

To verify through the official SDK instead (`bun add @supabase/supabase-js`), select the provider in `~/.hermes-remote/config.json`:

```json
{
  "auth": {
    "provider": "supabase",
    "url": "https://YOUR_PROJECT.supabase.co",
    "publishableKey": "sb_publishable_..."
  }
}
```

## Client side

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

Sign in however your product wants:

```ts
await supabase.auth.signInAnonymously();                        // guests with stable ids
await supabase.auth.signInWithOtp({ email });                    // email codes
await supabase.auth.signInWithOAuth({ provider: "github" });    // OAuth
```

Enable anonymous sign ins and your OAuth providers in the Supabase dashboard (Authentication settings), and add your app origin to the redirect allowlist.

## What the server does with the identity

* Sessions created by a user are owned by their Supabase `sub`; other users get 404s on them, listing shows only their own.
* Every agent turn carries the identity: signed in users are introduced with their user id and email, anonymous guests with their stable id.
* Ask the agent "who am I?" and it answers with the caller's identity, and nothing else, because the injected context contains nothing else.

## Notes

* Email OTP uses Supabase's built in mailer by default, which is rate limited to a handful of emails per hour; configure custom SMTP before production.
* Anonymous users can later be upgraded (linked to an email or OAuth identity) without losing their id, so their sessions survive the upgrade.
