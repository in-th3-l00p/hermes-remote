import { DemoAgent, HermesUpstreamError } from "../chat/index.ts";
import type {
  Upstream,
  UpstreamDiscovery,
  UpstreamJobs,
  UpstreamRuns,
  UpstreamSessions,
} from "./types.ts";

interface DemoRun {
  id: string;
  status: string;
  input: unknown;
  steered?: boolean;
  approved?: boolean;
}

interface DemoJob {
  id: string;
  paused: boolean;
  runs: number;
  [key: string]: unknown;
}

interface DemoSession {
  id: string;
  title: string | null;
  model: string | null;
  messages: { role: string; content: string }[];
  [key: string]: unknown;
}

function notFound(kind: string, id: string): HermesUpstreamError {
  return new HermesUpstreamError(404, `Unknown ${kind}: ${id}`);
}

function sseFrames(runId: string): string {
  return (
    `event: run.started\ndata: {"id":"${runId}"}\n\n` +
    `event: run.output\ndata: {"id":"${runId}","text":"demo output"}\n\n` +
    `event: run.completed\ndata: {"id":"${runId}","status":"completed"}\n\n`
  );
}

/** Offline Upstream used when no Hermes agent is configured. */
export class DemoUpstream implements Upstream {
  readonly chat = new DemoAgent();
  private readonly runStore = new Map<string, DemoRun>();
  private readonly jobStore = new Map<string, DemoJob>();
  private readonly sessionStore = new Map<string, DemoSession>();
  private nextRun = 1;
  private nextJob = 1;
  private nextSession = 1;

  constructor() {}

  readonly discovery: UpstreamDiscovery = {
    health: async () => ({ status: "ok", platform: "demo", version: "0.0.0" }),
    capabilities: async () => ({
      object: "demo.capabilities",
      platform: "demo",
      features: { chat_completions: true, run_submission: true },
    }),
    models: async () => ({
      object: "list",
      data: [{ id: "demo", object: "model", owned_by: "hermes-remote" }],
    }),
    modelOptions: async () => ({ options: [] }),
    skills: async () => ({ object: "list", data: [] }),
    toolsets: async () => ({ object: "list", data: [] }),
  };

  readonly runs: UpstreamRuns = {
    create: async (body) => {
      const run: DemoRun = {
        id: `run_${this.nextRun++}`,
        status: "completed",
        input: body["input"],
      };
      this.runStore.set(run.id, run);
      return { ...run };
    },
    get: async (id) => ({ ...this.requireRun(id) }),
    events: async (id) => {
      this.requireRun(id);
      const frames = new TextEncoder().encode(sseFrames(id));
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
    steer: async (id, body) => {
      const run = this.requireRun(id);
      run.steered = true;
      return { ...run, steer: body };
    },
    approve: async (id, body) => {
      const run = this.requireRun(id);
      run.approved = true;
      return { ...run, response: body };
    },
  };

  readonly jobs: UpstreamJobs = {
    list: async () => ({ jobs: [...this.jobStore.values()].map((j) => ({ ...j })) }),
    get: async (id) => ({ ...this.requireJob(id) }),
    create: async (body) => {
      const job: DemoJob = {
        ...(body as Record<string, unknown>),
        id: `job_${this.nextJob++}`,
        paused: false,
        runs: 0,
      };
      this.jobStore.set(job.id, job);
      return { ...job };
    },
    update: async (id, body) => {
      const job = this.requireJob(id);
      Object.assign(job, body);
      return { ...job };
    },
    remove: async (id) => {
      this.requireJob(id);
      this.jobStore.delete(id);
      return { deleted: true };
    },
    pause: async (id) => {
      const job = this.requireJob(id);
      job.paused = true;
      return { ...job };
    },
    resume: async (id) => {
      const job = this.requireJob(id);
      job.paused = false;
      return { ...job };
    },
    trigger: async (id) => {
      const job = this.requireJob(id);
      job.runs += 1;
      return { ...job };
    },
  };

  readonly sessions: UpstreamSessions = {
    list: async () => ({
      sessions: [...this.sessionStore.values()].map((s) => ({ ...s })),
    }),
    create: async (body) => {
      const session: DemoSession = {
        ...(body as Record<string, unknown>),
        id: `sess_${this.nextSession++}`,
        title: ((body as { title?: string }).title ?? null) as string | null,
        model: null,
        messages: [],
      };
      this.sessionStore.set(session.id, session);
      return { session: { ...session } };
    },
    get: async (id) => ({ session: { ...this.requireSession(id) } }),
    update: async (id, body) => {
      const session = this.requireSession(id);
      Object.assign(session, body);
      return { session: { ...session } };
    },
    remove: async (id) => {
      this.requireSession(id);
      this.sessionStore.delete(id);
      return { deleted: true, id };
    },
    messages: async (id) => ({
      messages: this.requireSession(id).messages.map((m) => ({ ...m })),
    }),
    fork: async (id, body) => {
      const source = this.requireSession(id);
      const fork: DemoSession = {
        ...source,
        ...(body as Record<string, unknown>),
        id: `sess_${this.nextSession++}`,
        messages: [...source.messages],
      };
      this.sessionStore.set(fork.id, fork);
      return { session: { ...fork } };
    },
    chat: async (id, body) => {
      const session = this.requireSession(id);
      const message = String((body as { message?: unknown }).message ?? "");
      session.messages.push({ role: "user", content: message });
      session.messages.push({ role: "assistant", content: `demo: ${message}` });
      return { output: `demo: ${message}` };
    },
    chatStream: async (id, body) => {
      const session = this.requireSession(id);
      const message = String((body as { message?: unknown }).message ?? "");
      session.messages.push({ role: "user", content: message });
      session.messages.push({ role: "assistant", content: `demo: ${message}` });
      const frames =
        `event: run.started\ndata: {"session_id":"${id}"}\n\n` +
        `event: message.delta\ndata: ${JSON.stringify({ delta: `demo: ${message}` })}\n\n` +
        `event: run.completed\ndata: ${JSON.stringify({ output: `demo: ${message}` })}\n\n`;
      const encoded = new TextEncoder().encode(frames);
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoded);
          controller.close();
        },
      });
    },
    modelLock: async (id, body) => {
      const session = this.requireSession(id);
      session.model = String((body as { model?: unknown }).model ?? "");
      return { session: { ...session } };
    },
  };

  private requireSession(id: string): DemoSession {
    const session = this.sessionStore.get(id);
    if (session === undefined) {
      throw notFound("session", id);
    }
    return session;
  }

  private requireRun(id: string): DemoRun {
    const run = this.runStore.get(id);
    if (run === undefined) {
      throw notFound("run", id);
    }
    return run;
  }

  private requireJob(id: string): DemoJob {
    const job = this.jobStore.get(id);
    if (job === undefined) {
      throw notFound("job", id);
    }
    return job;
  }
}
