import { HermesAgent, HermesUpstreamError } from "@in-th3-l00p/hermes-remote";
import type { AgentBackend } from "@in-th3-l00p/hermes-remote";

export const GROQ_BASE_URL = "https://api.groq.com/openai";
export const GROQ_MODEL = "llama-3.1-8b-instant";
export const MAX_OUTPUT_TOKENS = 400;

/** Injects the sandbox output cap into every completion request body. */
function cappedFetch(inner: typeof fetch): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    if (typeof init?.body === "string") {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      body["max_tokens"] = MAX_OUTPUT_TOKENS;
      init = { ...init, body: JSON.stringify(body) };
    }
    return inner(url, init);
  }) as typeof fetch;
}

export function groqAgent(apiKey: string, fetchImpl: typeof fetch): AgentBackend {
  return new HermesAgent({
    baseUrl: GROQ_BASE_URL,
    apiKey,
    model: GROQ_MODEL,
    fetch: cappedFetch(fetchImpl),
  });
}

export async function groqComplete(
  apiKey: string,
  fetchImpl: typeof fetch,
  input: string,
): Promise<string> {
  const res = await fetchImpl(`${GROQ_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: input }],
    }),
  });
  if (!res.ok) {
    throw new HermesUpstreamError(res.status, `Groq returned ${res.status}`);
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return body.choices?.[0]?.message?.content ?? "";
}
