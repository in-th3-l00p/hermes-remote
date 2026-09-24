import { identityTurn } from "../chat/identity.ts";
import type { Principal } from "../auth/index.ts";

/** A text input with the verified caller identity in front of it. */
export function identityPrefixed(input: string, principal: Principal): string {
  return `${identityTurn(principal).content}\n\n${input}`;
}

/**
 * Prepends the verified caller identity to a run's input, mirroring chat
 * turns. Returns null when the input is neither text nor a message list,
 * since such a run could not carry the identity.
 */
export function injectRunIdentity(
  body: Record<string, unknown>,
  principal: Principal,
): Record<string, unknown> | null {
  const preamble = identityTurn(principal).content;
  const input = body["input"];
  if (typeof input === "string") {
    return { ...body, input: identityPrefixed(input, principal) };
  }
  if (Array.isArray(input)) {
    // Callers can't add their own system-level turns next to the identity.
    const turns = input.filter(
      (m) =>
        typeof m !== "object" ||
        m === null ||
        !["system", "developer"].includes((m as { role?: unknown }).role as string),
    );
    return { ...body, input: [{ role: "system", content: preamble }, ...turns] };
  }
  return null;
}
