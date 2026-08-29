import { identityTurn } from "../chat/identity.ts";
import type { Principal } from "../auth/index.ts";

/** Prepends the verified caller identity to a run's input, mirroring chat turns. */
export function injectRunIdentity(
  body: Record<string, unknown>,
  principal: Principal,
): Record<string, unknown> {
  const preamble = identityTurn(principal).content;
  const input = body["input"];
  if (typeof input === "string") {
    return { ...body, input: `${preamble}\n\n${input}` };
  }
  if (Array.isArray(input)) {
    return { ...body, input: [{ role: "system", content: preamble }, ...input] };
  }
  return body;
}
