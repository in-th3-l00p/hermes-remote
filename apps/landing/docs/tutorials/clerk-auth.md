# 3.3 Authentication with Clerk

End to end: a Clerk application signing users in, Hermes Remote verifying their session tokens, and the agent greeting each caller by their verified identity.

## 1. Create the Clerk application

In the [Clerk dashboard](https://dashboard.clerk.com), create an application and pick your sign-in options (email, Google, GitHub, passkeys — anything works; Hermes Remote only sees the resulting session token). Collect two values from **API keys**:

* the **publishable key** (`pk_...`) for the frontend,
* the **secret key** (`sk_...`) for the server.

So the agent can greet users by email, add the claim under **Sessions → Customize session token**:

```json
{ "email": "{{user.primary_email_address}}" }
```

## 2. Configure the server

Install the SDK next to the server package and select the provider in `~/.hermes-remote/config.json`:

```bash
bun add @clerk/backend
```

```json
{
  "cors": ["http://localhost:5173"],
  "upstreamUrl": "http://127.0.0.1:8642",
  "upstreamKey": "YOUR_API_SERVER_KEY",
  "auth": {
    "provider": "clerk",
    "secretKey": "sk_test_...",
    "authorizedParties": ["http://localhost:5173"]
  }
}
```

```bash
hermes-remote serve
```

`authorizedParties` pins tokens to your app's origin — set it in production. For fully networkless verification swap `secretKey` for the dashboard's PEM `jwtKey`.

## 3. Wire the React client

```bash
bun add @clerk/clerk-react @in-th3-l00p/hermes-remote-client @in-th3-l00p/hermes-remote-react
```

Wrap the app in both providers — Clerk supplies the token, Hermes Remote consumes it:

```tsx
import { ClerkProvider, SignedIn, SignedOut, SignIn, UserButton, useAuth } from "@clerk/clerk-react";
import { HermesClient } from "@in-th3-l00p/hermes-remote-client";
import { HermesProvider } from "@in-th3-l00p/hermes-remote-react";
import { useMemo } from "react";

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <SignedOut>
        <SignIn />
      </SignedOut>
      <SignedIn>
        <WithHermes>{children}</WithHermes>
      </SignedIn>
    </ClerkProvider>
  );
}

function WithHermes({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const client = useMemo(
    () =>
      new HermesClient({
        baseUrl: "http://localhost:8643",
        tokenProvider: async () => (await getToken()) ?? "",
      }),
    [getToken],
  );
  return <HermesProvider client={client}>{children}</HermesProvider>;
}
```

`getToken()` returns a fresh short-lived session token on each call, so streams never start with a stale credential; on a 401 the client retries once with a new token automatically.

From here the chat itself is the standard hooks — see [the React chat tutorial](/tutorials/react-chat):

```tsx
import { useChat, useHermesClient } from "@in-th3-l00p/hermes-remote-react";

function Chat() {
  const client = useHermesClient();
  const { messages, send, streaming } = useChat({ client });
  return (
    <div>
      {messages.map((m) => (
        <p key={m.id}>{m.content}</p>
      ))}
      <button disabled={streaming} onClick={() => send("who am I?")}>
        ask
      </button>
    </div>
  );
}
```

## 4. Verify the identity end to end

With the app running, check what the server sees:

```bash
curl -H "authorization: Bearer $CLERK_SESSION_TOKEN" \
  http://localhost:8643/v1/auth/whoami
```

```json
{ "type": "user", "id": "user_2abc...", "email": "ada@example.com" }
```

Then ask the agent "who am I?" in the chat. It answers with the Clerk user id (and email, if you added the session claim) — and nothing else, because the injected identity context contains nothing else. Sessions created while signed in belong to that user id; other users get 404s on them.

## Notes

* User tokens are tier 1: they can chat and manage their own sessions, never administer the server. Administration stays with `hk_` API keys minted by the CLI.
* Quick start without a config file: `CLERK_SECRET_KEY=sk_test_... hermes-remote serve` enables the provider from the environment alone.
