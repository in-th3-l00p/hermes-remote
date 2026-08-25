import type { Principal } from "../auth/index.ts";

export function whoamiBody(principal: Principal): unknown {
  if (principal.type === "api_key") {
    return {
      type: "api_key",
      id: principal.record.id,
      name: principal.record.name,
      scopes: principal.record.scopes,
    };
  }
  if (principal.type === "user") {
    return {
      type: "user",
      id: principal.userId,
      ...(principal.email === undefined ? {} : { email: principal.email }),
    };
  }
  return { type: "anonymous" };
}
