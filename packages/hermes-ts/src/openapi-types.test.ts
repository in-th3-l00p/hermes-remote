import { describe, expect, test } from "bun:test";
import type { components } from "./openapi.ts";
import type { ChatMessage, ChatSession, WhoAmI } from "./types.ts";

// Compile-time drift checks between hand-written client types and the
// types generated from the server's OpenAPI document: these lines stop
// type-checking if either side changes shape.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Schemas = components["schemas"];

const message: Same<ChatMessage, Schemas["ChatMessage"]> = true;
const whoami: Same<WhoAmI, Schemas["WhoAmI"]> = true;
// Older servers may omit keyId/archived, so the client marks them optional.
const session: Same<
  Required<Pick<ChatSession, "keyId" | "archived">> & Omit<ChatSession, "keyId" | "archived">,
  Schemas["ChatSession"]
> = true;

describe("generated OpenAPI types", () => {
  test("match the hand-written client types", () => {
    expect([message, whoami, session]).toEqual([true, true, true]);
  });
});
