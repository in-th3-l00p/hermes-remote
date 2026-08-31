# Quick start

Five minutes from a local Hermes agent to a streaming chat over the web.

## 1. Enable the agent's API server

In the Hermes profile's `.env` (for example `~/.hermes/.env`):

```bash
API_SERVER_ENABLED=true
API_SERVER_KEY=$(openssl rand -hex 24)
```

Restart the gateway (`hermes gateway restart`). The agent now listens on `127.0.0.1:8642`. That key stays on this machine forever.

## 2. Mint a key and start the server

```bash
hermes-remote keys create --name my-app \
  --scope chat:invoke --scope sessions:read --scope sessions:write

hermes-remote serve --upstream http://127.0.0.1:8642 --upstream-key $API_SERVER_KEY
```

`keys create` prints the token once (`hk_<id>.<secret>`); store it now, it cannot be shown again. The server listens on port 8643. Without `--upstream` it answers with a built-in demo agent, which is useful for trying the stack offline.

## 3. Talk to it

With curl:

```bash
BASE=http://localhost:8643
TOKEN=hk_...

SESSION=$(curl -s -X POST "$BASE/v1/sessions" -H "Authorization: Bearer $TOKEN" | jq -r .id)
curl -N -X POST "$BASE/v1/sessions/$SESSION/messages" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"content":"hello"}'
```

Or with the TypeScript client:

```ts
import { HermesClient } from "@intheloop-studio/hermes-remote-client";

const client = new HermesClient({
  baseUrl: "http://localhost:8643",
  token: "hk_...",
});

const session = await client.createSession();
for await (const event of client.sendMessage(session.id, { content: "hello" })) {
  if (event.event === "delta") process.stdout.write(event.data.text);
}
```

Or in React:

```tsx
import { HermesClient, useChat } from "@intheloop-studio/hermes-remote-react";

const client = new HermesClient({ baseUrl: "http://localhost:8643", token: "hk_..." });

function Chat() {
  const { messages, streaming, send, stop } = useChat({ client });
  return (
    <div>
      {messages.map((m) => (
        <p key={m.id}>{m.role}: {m.content}</p>
      ))}
      <button disabled={streaming} onClick={() => void send("hello")}>send</button>
    </div>
  );
}
```

An API key in a browser bundle is a deployment error. For anything user facing, keep `hk_` keys on your backend and give browsers user tokens instead. That is the subject of [Authentication](/auth/).

## Next steps

* Real users: [Supabase](/tutorials/supabase-auth), [Clerk](/tutorials/clerk-auth), or a [custom provider](/tutorials/custom-auth).
* Production: [Deploying](/tutorials/deploying).
* Everything the API can do: [HTTP API](/api/).
