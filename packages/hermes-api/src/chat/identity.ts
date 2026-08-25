import type { AgentTurnMessage } from "./agent.ts";
import type { ChatStore } from "./store/index.ts";
import type { Principal } from "../auth/index.ts";

/** Tells the agent who it is speaking with, without leaking platform data. */
export function identityTurn(principal: Principal): AgentTurnMessage {
  let identity: string;
  if (principal.type === "user") {
    identity =
      principal.email === undefined
        ? `an authenticated anonymous guest (stable user id: ${principal.userId})`
        : `an authenticated user (user id: ${principal.userId}, email: ${principal.email})`;
  } else if (principal.type === "api_key") {
    identity = `a backend service using the API key "${principal.record.name}"`;
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
