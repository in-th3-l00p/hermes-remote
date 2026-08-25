import type { AgentTurnMessage } from "./agent.ts";
import type { ChatStore } from "./store/index.ts";
import type { Principal } from "../auth/index.ts";

/** User-influenced strings land in a system turn for a terminal-capable
 * agent: strip markup/control characters so they cannot smuggle directives. */
function sanitize(value: string): string {
  return value
    .replace(/[<>`]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

/** Tells the agent who it is speaking with, without leaking platform data. */
export function identityTurn(principal: Principal): AgentTurnMessage {
  let identity: string;
  if (principal.type === "user") {
    identity =
      principal.email === undefined
        ? `an authenticated anonymous guest (stable user id: ${sanitize(principal.userId)})`
        : `an authenticated user (user id: ${sanitize(principal.userId)}, email: ${sanitize(principal.email)})`;
  } else if (principal.type === "api_key") {
    identity = `a backend service using the API key "${sanitize(principal.record.name)}"`;
  } else {
    identity = "an unauthenticated guest";
  }
  return {
    role: "system",
    content:
      `<user-context>You are chatting through hermes-remote with ${identity}. ` +
      "Address them accordingly and never attribute this conversation to anyone else.</user-context>",
    attachments: [],
  };
}

export function history(
  store: ChatStore,
  sessionId: string,
  principal: Principal,
): AgentTurnMessage[] {
  const session = store.getSession(sessionId);
  const turns: AgentTurnMessage[] = (session?.messages ?? [])
    .filter((m) => m.status === "done")
    .map((m) => ({
      role: m.role,
      content: m.content,
      attachments: m.attachments,
    }));
  return [identityTurn(principal), ...turns];
}
