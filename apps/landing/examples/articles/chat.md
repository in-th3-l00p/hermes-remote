# The reference chat app

This is the chat app in the repository's `apps/chat`, the same code you can run against your own server. On this site it runs on built-in demo data in your browser, which is why it shows a demo banner. Everything on screen comes from one `HermesClient` and the `useChat` hook.

## One client, three ways to connect

```ts
import { HermesClient } from "@intheloop-studio/hermes-remote-react";

export const client = new HermesClient({
  baseUrl: import.meta.env.VITE_HERMES_API_URL,
  // Signed-in users: hand the client a fresh token whenever it needs one.
  tokenProvider: async () => (await supabase.auth.getSession()).data.session?.access_token ?? "",
});
```

- **Signed in** (Supabase here, any provider in general): each person gets their own chats, and search works across them.
- **Anonymous** (`hermes-remote serve --anonymous`): chats are addressed by id, so the app remembers the ids it created in `localStorage` and lists them with `client.listSessions(ids)`.
- **Demo** (this page): the client is given a `fetch` that answers from sample data. The client can't tell the difference, because `fetch` is an ordinary option.

## useChat runs the conversation

```tsx
const chat = useChat({ client });

chat.send("Summarize the overnight logs", attachments); // streams the reply
chat.edit(lastMessage.id, "Summarize only the errors"); // replace and regenerate
chat.react(reply.id, "🔥");                             // toggle a reaction
chat.stop();                                            // keep the partial reply
chat.open(sessionId);                                   // load an earlier chat
chat.reset();                                           // next send starts a new chat
```

`chat.messages` fills in token by token while `chat.streaming` is true; the Send button becomes Stop for that time. The first send creates the session, so the app only needs to refresh its list afterwards.

## The chat list

The sidebar uses the client's session methods directly: `listSessions`, `searchSessions` (owner-scoped, for signed-in users), `renameSession`, `archiveSession` and `deleteSession`. Archived chats leave the list but keep their history; `listSessions(undefined, { archived: true })` brings them back.

## Details worth copying

- **Attachments are checked in the browser** against the types the server accepts (PNG, JPEG, GIF, WebP), so a wrong file gets a clear message instead of a failed send.
- **The thread is a live region** (`role="log"`, `aria-live="polite"`), so screen readers announce replies as they stream. Icon buttons have labels, and editing moves focus into the message box.
- **On phones the chat list is a drawer**, opened from the top bar.
- **Errors say what happened**, for example a reply that didn't finish, and what to do next.

The source is small enough to read in one sitting: `src/App.tsx` for the flow, `src/components/` for the pieces.
