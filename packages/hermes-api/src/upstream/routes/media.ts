import { Prompt, Query, Task, Url } from "../../openapi/schemas.ts";
import { readBody } from "../../openapi/validate.ts";
import { checkPublicUrl } from "../net-guard.ts";
import type { Context, Hono } from "hono";
import { principalKey } from "../../auth/index.ts";
import { error, json, requireScope, type ChatEnv } from "../../chat/routes/shared.ts";
import { identityPrefixed } from "../identity.ts";
import { upstreamFailure, type UpstreamRouteOptions } from "./shared.ts";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function toolInput(tool: string, instruction: string): string {
  return (
    `Call the ${tool} tool exactly once. ${instruction} ` +
    "Return ONLY the raw JSON tool result, with no commentary."
  );
}

async function audioApiEnabled(options: UpstreamRouteOptions): Promise<unknown> {
  return options.upstream.discovery.capabilities().catch(() => null);
}


export function registerMediaRoutes(
  app: Hono<ChatEnv>,
  options: UpstreamRouteOptions,
): void {
  const pollMs = options.pollMs ?? 500;
  const runTimeoutMs = options.toolRunTimeoutMs ?? 120_000;

  async function toolRun(
    c: Context<ChatEnv>,
    tool: string,
    instruction: string,
  ): Promise<Response> {
    const principal = c.get("principal");
    try {
      const payload =
        principal.type === "api_key"
          ? { input: toolInput(tool, instruction) }
          : { input: identityPrefixed(toolInput(tool, instruction), principal) };
      const created = (await options.upstream.runs.create(payload)) as {
        id?: string;
        run_id?: string;
      };
      const id = created.id ?? created.run_id;
      if (typeof id !== "string" || id === "") {
        return error(502, "upstream_error", "Upstream did not return a run id");
      }
      options.runStore.record(id, principalKey(principal));
      options.events?.publish("run.created", { id, tool });
      const startedAt = Date.now();
      for (;;) {
        const run = (await options.upstream.runs.get(id)) as {
          status?: string;
          output?: unknown;
        };
        if (run.status === "completed") {
          const output = typeof run.output === "string" ? run.output : "";
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(output);
          } catch {
            parsed = null;
          }
          return json(200, { runId: id, output: parsed, raw: output });
        }
        if (run.status === "failed" || run.status === "stopped") {
          return error(502, "upstream_error", `Run ${run.status}`);
        }
        if (Date.now() - startedAt > runTimeoutMs) {
          return error(504, "run_timeout", "Tool run did not complete in time");
        }
        await sleep(pollMs);
      }
    } catch (cause) {
      return upstreamFailure(cause);
    }
  }

  app.post("/v1/media/tts", async (c) => {
    const denied = requireScope(c.get("principal"), "chat:invoke");
    if (denied !== null) {
      return denied;
    }
    const capabilities = (await audioApiEnabled(options)) as {
      features?: { audio_api?: unknown };
    } | null;
    if (capabilities?.features?.audio_api !== true) {
      return Response.json(
        {
          error: {
            code: "not_supported",
            message: "The upstream agent does not expose an audio API",
          },
          capabilities: capabilities?.features ?? null,
        },
        { status: 501 },
      );
    }
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    const upstreamResponse = await options.upstream.raw(
      "POST",
      "/v1/audio/speech",
      body,
      c.req.raw.signal,
    );
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        "content-type":
          upstreamResponse.headers.get("content-type") ?? "application/octet-stream",
      },
    });
  });

  app.post("/v1/media/images", async (c) => {
    const denied = requireScope(c.get("principal"), "chat:invoke");
    if (denied !== null) {
      return denied;
    }
    const body = await readBody(c, Prompt);
    if (body instanceof Response) {
      return body;
    }
    const model = body.model === undefined ? "" : ` Use the ${body.model} model.`;
    return toolRun(
      c,
      "image_gen",
      `Generate an image for this prompt: ${body.prompt}.${model}`,
    );
  });

  app.post("/v1/web/search", async (c) => {
    const denied = requireScope(c.get("principal"), "chat:invoke");
    if (denied !== null) {
      return denied;
    }
    const body = await readBody(c, Query);
    if (body instanceof Response) {
      return body;
    }
    return toolRun(c, "web_search", `Search the web for: ${body.query}.`);
  });

  app.post("/v1/web/extract", async (c) => {
    const denied = requireScope(c.get("principal"), "chat:invoke");
    if (denied !== null) {
      return denied;
    }
    const body = await readBody(c, Url);
    if (body instanceof Response) {
      return body;
    }
    // The agent fetches this URL from the host, so it must not reach the
    // host's own network; only the normalized href goes into the prompt.
    const checked = await checkPublicUrl(body.url);
    if ("reason" in checked) {
      return error(400, "url_not_allowed", `url refused: ${checked.reason}`);
    }
    return toolRun(c, "web_extract", `Extract the content of ${checked.url.href}.`);
  });

  app.post("/v1/browser/tasks", async (c) => {
    const principal = c.get("principal");
    const denied = requireScope(principal, "chat:invoke");
    if (denied !== null) {
      return denied;
    }
    const body = await readBody(c, Task);
    if (body instanceof Response) {
      return body;
    }
    try {
      const input = `Using the browser automation toolset, complete this task and report the outcome: ${body.task}`;
      const payload =
        principal.type === "api_key"
          ? { input }
          : { input: identityPrefixed(input, principal) };
      const created = (await options.upstream.runs.create(payload)) as {
        id?: string;
        run_id?: string;
      };
      const id = created.id ?? created.run_id;
      if (typeof id !== "string" || id === "") {
        return error(502, "upstream_error", "Upstream did not return a run id");
      }
      options.runStore.record(id, principalKey(principal));
      options.events?.publish("run.created", { id, tool: "browser" });
      return json(201, { runId: id });
    } catch (cause) {
      return upstreamFailure(cause);
    }
  });

  for (const path of ["/v1/chat/completions", "/v1/responses"]) {
    app.post(path, async (c) => {
      const principal = c.get("principal");
      if (principal.type !== "api_key") {
        return error(403, "api_key_required", "Raw passthrough requires an API key");
      }
      const denied = requireScope(principal, "chat:invoke");
      if (denied !== null) {
        return denied;
      }
      const body = (await c.req.json().catch(() => ({}))) as unknown;
      const upstreamResponse = await options.upstream.raw(
        "POST",
        path,
        body,
        c.req.raw.signal,
      );
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: {
          "content-type":
            upstreamResponse.headers.get("content-type") ?? "application/json",
        },
      });
    });
  }
}
