# Hermes Remote announcement thread (X)

Post at launch from the account owner. Attach the screen recording to post 1 and the og image to post 3.

## Post 1

I put my Hermes agent on the web.

Hermes Remote is an open source bridge that turns a local @NousResearch Hermes agent into a real product: an authenticated API, a typed TypeScript client, and React hooks.

Streaming chat, persistent sessions, reactions, edits, image attachments. A full chat UI is one hook: useChat()

[attach: 30 to 45 second recording of the chat app: GitHub sign in, a streaming markdown answer, a reaction, an edit that regenerates, switching sessions]

## Post 2

Security first: nothing is exposed without authorization.

Scoped API keys for backends (four permission tiers, dangerous scopes need explicit acknowledgment). Supabase JWTs for users, verified against the project JWKS, so no shared secret ever sits on the server. Anonymous guests still get stable identities.

And the agent is told exactly who it is speaking with on every turn.

## Post 3

Everything is open source, 100% test coverage, built with Bun.

Site: https://hermes-remote.tiscacatalin.com
Docs: https://hermes-remote.tiscacatalin.com/docs/
Code: https://github.com/in-th3-l00p/hermes-remote

npm i -g @in-th3-l00p/hermes-remote
hermes-remote keys create --name my-app --scope chat:invoke
hermes-remote serve
