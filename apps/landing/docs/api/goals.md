# Goals and slash commands

Goals ("Ralph loops") are the agent's standing objectives: after each turn a judge model decides whether to continue, stop, or wait. hermes-remote reads goal state directly from the agent's session database and writes it through a slash-command relay.

These routes live under the agent's own sessions (`/v1/agent/sessions/:id/...`), are API-key only, and use the tier 1 scopes `goals:read` and `goals:write`.

## Reading goal state

Reads come straight from `state.db`, so they always work:

| Route | Scope | Returns |
| ----- | ----- | ------- |
| `GET /v1/agent/sessions/:id/goal` | `goals:read` | The full goal state |
| `GET /v1/agent/sessions/:id/goal/gates` | `goals:read` | `{ gates: [{command, passing}] }` |
| `GET /v1/agent/sessions/:id/goal/subgoals` | `goals:read` | `{ subgoals: [...] }` |

The goal state shape:

```json
{
  "text": "ship the report",
  "contract": { "outcome": "...", "verification": "..." },
  "subgoals": ["draft", "review"],
  "gates": [{ "command": "bun test", "passing": true }],
  "turns": { "used": 4, "max": 20 },
  "wait": null,
  "verdict": "continue",
  "raw": {}
}
```

## Writing through the command relay

Mutations map to the agent's `/goal` and `/subgoal` slash commands, delivered over the upstream session-chat stream:

| Route | Slash command |
| ----- | ------------- |
| `PUT .../goal` body `{text, draft?}` | `/goal <text>` or `/goal draft <text>` |
| `DELETE .../goal` | `/goal clear` |
| `POST .../goal/pause` and `/resume` | `/goal pause` and `/goal resume` |
| `POST .../goal/wait` body `{pid, reason?}` | `/goal wait <pid>` |
| `POST .../goal/unwait` | `/goal unwait` |
| `POST .../goal/gates` body `{command}` | `/goal gate add <command>` |
| `DELETE .../goal/gates/:n` and `DELETE .../goal/gates` | gate remove and clear |
| `POST .../goal/subgoals` body `{text}` | `/subgoal add <text>` |
| `DELETE .../goal/subgoals/:n` and `DELETE .../goal/subgoals` | subgoal remove and clear |

All writes need `goals:write` and return `{ ok, events }`, where `events` are the SSE frames the upstream produced for the relayed turn.

**The relay is disabled by default.** Verified against a live agent: the upstream API server does not intercept slash commands, so a relayed command is processed as a normal model turn. That is usually not what you want, so write routes return 501 `not_supported` until you opt in with `"commandRelay": true` in [config.json](/server/config). Goal reads work regardless.

## The command allowlist

`GET /v1/commands` lists the relayable commands, whether the relay is on, and the scope each command requires. `POST /v1/agent/sessions/:id/commands` runs one:

```bash
curl -s -X POST "$BASE/v1/agent/sessions/$SESSION/commands" \
  -H "Authorization: Bearer $HK_TOKEN" -H "content-type: application/json" \
  -d '{"command":"/goal status"}'
```

Unknown commands get 400 `unknown_command`. The allowlist and required scopes:

| Command | Scope |
| ------- | ----- |
| `/goal`, `/subgoal` | `goals:write` |
| `/title` | `sessions:write-all` |
| `/model` | `providers:manage` |
| `/busy`, `/hatch` | `chat:invoke` |
| `/rollback` | `checkpoints:rollback` |
| `/context`, `/status` | `status:read` |
| `/journey` | `memory:read` |
| `/personality` | `soul:write` |
| `/skills` | `skills:write` |
| `/cron` | `crons:write` |
| `/sessions` | `sessions:read-all` |
