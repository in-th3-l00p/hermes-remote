import {
  DemoUpstream,
  HermesUpstreamError,
} from "@in-th3-l00p/hermes-remote";
import type {
  AgentBackend,
  Upstream,
  UpstreamDiscovery,
  UpstreamJobs,
  UpstreamRuns,
  UpstreamSessions,
} from "@in-th3-l00p/hermes-remote";
import { GROQ_BASE_URL, GROQ_MODEL, groqAgent, groqComplete } from "./groq.ts";

export interface SandboxOptions {
  groqKey?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

interface SandboxRun {
  id: string;
  status: string;
  input: string;
  output: string;
  created_at: string;
}

function sseFrames(run: SandboxRun): string {
  const data = (payload: unknown): string => JSON.stringify(payload);
  return (
    `event: run.started\ndata: ${data({ run_id: run.id })}\n\n` +
    `event: message.delta\ndata: ${data({ run_id: run.id, delta: run.output })}\n\n` +
    `event: run.completed\ndata: ${data({ run_id: run.id, status: run.status, output: run.output })}\n\n`
  );
}

/** The live-examples upstream: real Groq inference, seeded demo everything else. */
export class SandboxUpstream implements Upstream {
  readonly chat: AgentBackend;
  readonly sessions: UpstreamSessions;
  readonly jobs: UpstreamJobs;
  private readonly demo = new DemoUpstream();
  private readonly options: SandboxOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly sandboxRuns = new Map<string, SandboxRun>();
  private nextRun = 1;

  constructor(options: SandboxOptions = {}) {
    this.options = options;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.chat =
      options.groqKey === undefined
        ? this.demo.chat
        : groqAgent(options.groqKey, this.fetchImpl);
    this.sessions = this.demo.sessions;
    this.jobs = this.demo.jobs;
    void this.seedJobs();
  }

  private async seedJobs(): Promise<void> {
    await this.demo.jobs.create({
      name: "morning-briefing",
      schedule: "0 7 * * *",
      prompt: "Compose the sandbox morning briefing.",
    });
    await this.demo.jobs.create({
      name: "memory-tidy",
      schedule: "every 6h",
      prompt: "Consolidate sandbox memory entries.",
    });
    await this.demo.sessions.create({ title: "sandbox tour" });
  }

  readonly discovery: UpstreamDiscovery = {
    health: async () => ({
      status: "ok",
      platform: "hermes-remote-sandbox",
      version: "sandbox",
      model: this.options.groqKey === undefined ? "demo" : GROQ_MODEL,
    }),
    capabilities: async () => ({
      object: "sandbox.capabilities",
      platform: "hermes-remote-sandbox",
      model: this.options.groqKey === undefined ? "demo" : GROQ_MODEL,
      features: {
        chat_completions: true,
        run_submission: true,
        audio_api: false,
        sandbox: true,
      },
    }),
    models: async () => ({
      object: "list",
      data: [
        {
          id: this.options.groqKey === undefined ? "demo" : GROQ_MODEL,
          object: "model",
          owned_by: "sandbox",
        },
      ],
    }),
    modelOptions: async () => ({ options: [] }),
    skills: async () => ({
      object: "list",
      data: [
        { name: "web-research", description: "Structured web research with source tracking" },
        { name: "daily-briefing", description: "Compose the morning briefing" },
      ],
    }),
    toolsets: async () => ({
      object: "list",
      data: [
        { name: "web", label: "Web search", enabled: true, tools: ["web_search", "web_extract"] },
        { name: "memory", label: "Memory", enabled: true, tools: ["memory"] },
      ],
    }),
  };

  readonly runs: UpstreamRuns = {
    create: async (body) => {
      const input = typeof body["input"] === "string" ? body["input"] : "";
      const output =
        this.options.groqKey === undefined
          ? `sandbox demo run: ${input.slice(0, 160)}`
          : await groqComplete(this.options.groqKey, this.fetchImpl, input);
      const run: SandboxRun = {
        id: `run_${this.nextRun++}`,
        status: "completed",
        input,
        output,
        created_at: this.now().toISOString(),
      };
      this.sandboxRuns.set(run.id, run);
      return { ...run };
    },
    get: async (id) => ({ ...this.requireRun(id) }),
    events: async (id) => {
      const frames = new TextEncoder().encode(sseFrames(this.requireRun(id)));
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(frames);
          controller.close();
        },
      });
    },
    stop: async (id) => {
      const run = this.requireRun(id);
      run.status = "stopped";
      return { ...run };
    },
    steer: async (id, body) => ({ ...this.requireRun(id), steer: body }),
    approve: async (id, body) => ({ ...this.requireRun(id), response: body }),
  };

  async raw(method: string, path: string, body?: unknown): Promise<Response> {
    if (path === "/v1/chat/completions" || path === "/v1/responses") {
      if (this.options.groqKey === undefined) {
        return this.demo.raw(method, "/v1/chat/completions", body);
      }
      return this.fetchImpl(`${GROQ_BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.groqKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          max_tokens: 400,
          ...(typeof body === "object" && body !== null ? body : {}),
        }),
      });
    }
    return Response.json(
      { error: { message: `not available in the sandbox: ${path}` } },
      { status: 404 },
    );
  }

  private requireRun(id: string): SandboxRun {
    const run = this.sandboxRuns.get(id);
    if (run === undefined) {
      throw new HermesUpstreamError(404, `Unknown run: ${id}`);
    }
    return run;
  }
}
