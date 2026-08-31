# Files: memory, soul, skills, bundles

These routes read and write documents in the agent's home directory (`~/.hermes` or the profile's home) through a filesystem bridge. Paths are allowlisted and traversal-safe, and credentials (`.env`, `auth.json`, key material) are unreadable by construction; an out-of-bounds path gets 400 `path_denied`.

Like all management surfaces, these are API-key only. Reads use the `:read` scope of each area, writes the `:write` scope. All routes honor `X-Hermes-Profile`.

## Memory

The agent's two bounded memory files, injected into its system prompt at session start.

| Route | Scope | Purpose |
| ----- | ----- | ------- |
| `GET /v1/memory` | `memory:read` | MEMORY.md as `{ content, chars, limit }` (limit 2,200) |
| `PUT /v1/memory` body `{content}` | `memory:write` | Replace MEMORY.md |
| `GET /v1/memory/user` | `memory:read` | USER.md (limit 1,375) |
| `PUT /v1/memory/user` body `{content}` | `memory:write` | Replace USER.md |
| `POST /v1/memory/entries` | `memory:write` | Line-level edit of MEMORY.md |

`POST /v1/memory/entries` takes `{"action": "add" | "replace" | "remove", "text": "...", "from": "..."}`. `add` appends a line, `replace` swaps the line equal to `from`, `remove` deletes the line equal to `text`. A missing line gets 404 `entry_not_found`. Writes that would exceed the character limit get 400 `memory_overflow`; consolidate instead.

```bash
curl -s -X POST "$BASE/v1/memory/entries" \
  -H "Authorization: Bearer $HK_TOKEN" -H "content-type: application/json" \
  -d '{"action":"add","text":"prefers concise answers"}'
```

## Soul

| Route | Scope | Purpose |
| ----- | ----- | ------- |
| `GET /v1/soul` | `soul:read` | SOUL.md as `{ content }` |
| `PUT /v1/soul` body `{content}` | `soul:write` | Replace SOUL.md |

Skins are CLI-backed; see the [management catalog](/api/management).

## Skills

Direct file access to `skills/<name>/`. Skill names match `[A-Za-z0-9_-]+`.

| Route | Scope | Purpose |
| ----- | ----- | ------- |
| `POST /v1/skills` body `{name, content}` | `skills:write` | Create `skills/<name>/SKILL.md`; 409 if it exists |
| `GET /v1/skills/:name` | `skills:read` | Read SKILL.md |
| `PATCH /v1/skills/:name` body `{content}` | `skills:write` | Overwrite SKILL.md |
| `DELETE /v1/skills/:name` | `skills:write` | Delete SKILL.md |
| `GET /v1/skills/:name/files/*path` | `skills:read` | Read a reference file |
| `PUT /v1/skills/:name/files/*path` body `{content}` | `skills:write` | Write a reference file |

Skill hub installs, updates, audits, taps, the pending-approval queue, and the curator are CLI-backed; see the [management catalog](/api/management). `GET /v1/skills` (the index) is proxied from the agent; see [Discovery](/api/discovery).

## Bundles

Skill bundles are YAML files in `skill-bundles/`.

| Route | Scope | Purpose |
| ----- | ----- | ------- |
| `GET /v1/bundles` | `bundles:read` | All bundles as `{ bundles: [{name, content}] }` |
| `GET /v1/bundles/:name` | `bundles:read` | One bundle |
| `PUT /v1/bundles/:name` body `{content}` | `bundles:write` | Create or replace |
| `DELETE /v1/bundles/:name` | `bundles:write` | Delete |

## Cron output and subagents

| Route | Scope | Purpose |
| ----- | ----- | ------- |
| `GET /v1/jobs/:id/output` | `crons:read` | List files in `cron/output/<id>/` |
| `GET /v1/jobs/:id/output/:file` | `crons:read` | Read one output file |
| `GET /v1/subagents` | `subagents:read` | List live delegation transcripts (`cache/delegation/live/`) |
