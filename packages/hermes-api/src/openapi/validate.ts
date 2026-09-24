import type { Context } from "hono";
import type { z } from "zod";
import { error } from "../chat/routes/shared.ts";

/**
 * Parses a JSON request body with the same zod schema the OpenAPI document
 * publishes. Returns the parsed value, or a 400 naming the first problem.
 */
export async function readBody<T extends z.ZodType>(
  c: Context,
  schema: T,
  code = "invalid_request",
): Promise<z.output<T> | Response> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  const issue = parsed.error.issues[0] as z.core.$ZodIssue;
  const where = issue.path.length === 0 ? "body" : issue.path.join(".");
  return error(400, code, `${where}: ${issue.message}`);
}
