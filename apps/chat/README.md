# Hermes Remote chat

The reference chat app for [Hermes Remote](https://hermes-remote.tiscacatalin.com): streaming replies, image attachments, reactions, editing and regenerating, stopping a reply, and a chat list you can search, rename, archive and delete. It works on phones (the chat list becomes a drawer) and with screen readers.

```bash
bun install
cp apps/chat/.env.example apps/chat/.env.local   # then edit it
bun run --cwd apps/chat dev
```

- **Demo mode.** With `VITE_HERMES_API_URL` unset, the app runs against a fake server in the browser with canned replies and says so in a banner. Useful for trying the UI with no agent.
- **Anonymous.** Point `VITE_HERMES_API_URL` at a server started with `hermes-remote serve --anonymous`. Chats are addressed by id, so this browser remembers the ones it created.
- **Signed in.** Also set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and configure the server's Supabase auth provider. Each user sees their own chats and can search them.

The whole app is built on `useChat` and the client's session methods; see `src/App.tsx`.
