import type { AgentTurnMessage } from "./agent.ts";
import type { ChatStore } from "./store/index.ts";
import type { Principal } from "../auth/index.ts";

/*
 * User-influenced strings land in a system turn for a terminal-capable
 * agent, so they are reduced to shapes that cannot read as instructions:
 * ids and names keep a plain character set, and an email that isn't a
 * plain address is dropped rather than echoed.
 */
function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._:@-]/g, "_").slice(0, 128);
}

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9 ._-]/g, "_").slice(0, 64);
}

const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;

function safeEmail(value: string | undefined): string | null {
  return value !== undefined && EMAIL.test(value) ? value : null;
}

/**
 * What the agent learns about a token-exchange user, per agent_visibility.
 * Only a few plain profile fields are ever shared; metadata never is.
 */
function exchangedIdentity(
  userId: string,
  visibility: "anonymous" | "pseudonymous" | "full",
  profile: Record<string, unknown>,
): string {
  if (visibility === "anonymous") {
    return "a platform user whose identity is not shared";
  }
  const id = safeId(userId);
  if (visibility === "pseudonymous") {
    return `a returning platform user (stable user id: ${id})`;
  }
  const fields: string[] = [`user id: ${id}`];
  for (const key of ["name", "locale", "timezone"] as const) {
    const value = profile[key];
    if (typeof value === "string" && value.trim() !== "") {
      fields.push(`${key}: ${safeName(value)}`);
    }
  }
  const email = safeEmail(typeof profile["email"] === "string" ? profile["email"] : undefined);
  if (email !== null) {
    fields.push(`email: ${email}`);
  }
  return `a platform user (${fields.join(", ")})`;
}

/** Tells the agent who it is speaking with, without leaking platform data. */
export function identityTurn(principal: Principal): AgentTurnMessage {
  let identity: string;
  if (principal.type === "user" && principal.visibility !== undefined) {
    identity = exchangedIdentity(principal.userId, principal.visibility, principal.profile ?? {});
  } else if (principal.type === "user") {
    const id = safeId(principal.userId);
    const email = safeEmail(principal.email);
    identity =
      principal.guest === true
        ? `a guest signed in anonymously (stable user id: ${id})`
        : email === null
          ? `an authenticated user (user id: ${id})`
          : `an authenticated user (user id: ${id}, email: ${email})`;
  } else if (principal.type === "api_key") {
    identity = `a backend service using the API key "${safeName(principal.record.name)}"`;
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
