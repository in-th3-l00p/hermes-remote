/**
 * What hermes-remote does with each caller × request, step by step. These
 * are the server's real answers (the authorization-matrix and route tests
 * pin them down), not an illustration.
 */

export type CallerId = "stranger" | "user" | "backend" | "ops";
export type RequestId = "chat" | "foreign" | "config";
export type StepId = "token" | "scope" | "owner" | "identity";

export interface Caller {
  id: CallerId;
  label: string;
  token: string;
}

export interface Request {
  id: RequestId;
  label: string;
  line: string;
}

export interface Outcome {
  /** Checkpoints passed, in order; the next one (if any) is where it stopped. */
  passed: StepId[];
  stoppedAt: StepId | null;
  status: number;
  verdict: string;
  detail: string;
  /** The sentence prepended to the turn, when the agent is reached for a chat. */
  identity?: string;
  body: string;
}

export const CALLERS: Caller[] = [
  { id: "stranger", label: "No token at all", token: "no Authorization header" },
  { id: "user", label: "A signed-in user", token: "Bearer <user JWT>" },
  { id: "backend", label: "Your backend's key", token: "Bearer hk_… (chat:invoke, sessions:*)" },
  { id: "ops", label: "An ops key", token: "Bearer hk_… (config:read)" },
];

export const REQUESTS: Request[] = [
  { id: "chat", label: "Send a chat message", line: "POST /v1/sessions/3fa9…/messages" },
  { id: "foreign", label: "Read another user's chat", line: "GET /v1/sessions/b71c…/messages" },
  { id: "config", label: "Read the agent's config", line: "GET /v1/config" },
];

export const STEPS: { id: StepId; name: string; question: string }[] = [
  { id: "token", name: "Token", question: "Is there a valid key or user token?" },
  { id: "scope", name: "Scope", question: "May this caller use this route at all?" },
  { id: "owner", name: "Ownership", question: "Is the resource theirs?" },
  { id: "identity", name: "Identity", question: "Tell the agent who is asking." },
];

const unauthorized: Outcome = {
  passed: [],
  stoppedAt: "token",
  status: 401,
  verdict: "Returned",
  detail: "No token, so nothing else is revealed: every route answers the same.",
  body: '{ "error": { "code": "unauthorized", "message": "Missing bearer token" } }',
};

const OUTCOMES: Record<CallerId, Record<RequestId, Outcome>> = {
  stranger: { chat: unauthorized, foreign: unauthorized, config: unauthorized },
  user: {
    chat: {
      passed: ["token", "scope", "owner", "identity"],
      stoppedAt: null,
      status: 200,
      verdict: "Delivered",
      detail: "The reply streams back token by token over server-sent events.",
      identity:
        "You are chatting through hermes-remote with an authenticated user (user id: 8c1e…, email: ada@example.com).",
      body: 'event: delta\ndata: {"id":"a1","text":"Hi Ada"}',
    },
    foreign: {
      passed: ["token", "scope"],
      stoppedAt: "owner",
      status: 404,
      verdict: "Returned",
      detail: "Not 403: another user's session is indistinguishable from one that doesn't exist.",
      body: '{ "error": { "code": "session_not_found", "message": "Unknown session" } }',
    },
    config: {
      passed: ["token"],
      stoppedAt: "scope",
      status: 403,
      verdict: "Returned",
      detail:
        "Agent settings are an operator surface. User tokens never reach it, whatever they hold.",
      body: '{ "error": { "code": "api_key_required", "message": "This surface requires an API key" } }',
    },
  },
  backend: {
    chat: {
      passed: ["token", "scope", "owner", "identity"],
      stoppedAt: null,
      status: 200,
      verdict: "Delivered",
      detail: "Keys own the sessions they create, and the agent knows which service is calling.",
      identity:
        'You are chatting through hermes-remote with a backend service using the API key "web".',
      body: 'event: delta\ndata: {"id":"a1","text":"On it"}',
    },
    foreign: {
      passed: ["token", "scope"],
      stoppedAt: "owner",
      status: 404,
      verdict: "Returned",
      detail: "Reading other people's chats takes the separate sessions:read-all scope.",
      body: '{ "error": { "code": "session_not_found", "message": "Unknown session" } }',
    },
    config: {
      passed: ["token"],
      stoppedAt: "scope",
      status: 403,
      verdict: "Returned",
      detail: "Scopes are exact: this key was minted for chat, not configuration.",
      body: '{ "error": { "code": "missing_scope", "message": "This route requires the config:read scope" } }',
    },
  },
  ops: {
    chat: {
      passed: ["token"],
      stoppedAt: "scope",
      status: 403,
      verdict: "Returned",
      detail: "An ops key can't talk to the agent unless it was also given chat:invoke.",
      body: '{ "error": { "code": "missing_scope", "message": "This route requires the chat:invoke scope" } }',
    },
    foreign: {
      passed: ["token"],
      stoppedAt: "scope",
      status: 403,
      verdict: "Returned",
      detail: "No sessions:read, so no chat history at all.",
      body: '{ "error": { "code": "missing_scope", "message": "This route requires the sessions:read scope" } }',
    },
    config: {
      passed: ["token", "scope"],
      stoppedAt: null,
      status: 200,
      verdict: "Delivered",
      detail:
        "Host-wide and keys-only, so there's no owner to check. Secrets in the output are masked.",
      body: '{ "ok": true, "raw": "model: claude-opus\\nOPENAI_API_KEY=[redacted]" }',
    },
  },
};

export function outcomeFor(caller: CallerId, request: RequestId): Outcome {
  return OUTCOMES[caller][request];
}

/** Steps that don't apply to a request (config is not a chat turn). */
export function skippedSteps(request: RequestId): StepId[] {
  return request === "config" ? ["owner", "identity"] : [];
}
