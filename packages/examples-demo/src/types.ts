/** Wire-compatible message shape (matches the hermes-remote chat store). */
export interface DemoMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: { name: string; type: string; dataUrl: string }[];
  reactions: Record<string, number>;
  createdAt: string;
  editedAt: string | null;
  status: "streaming" | "done" | "error";
}

export interface DemoSessionMeta {
  id: string;
  userId: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DemoSession extends DemoSessionMeta {
  messages: DemoMessage[];
}

export interface DemoRun {
  id: string;
  status: "completed" | "running" | "failed" | "stopped";
  input: string;
  output: string;
  created_at: string;
}

export interface DemoJob {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  status: string;
  last_run: string | null;
}

/** Per-profile agent home: identity, memory files, status output, config. */
export interface DemoProfileHome {
  soul: string;
  memory: string;
  user: string;
  status: string;
  config: Record<string, string>;
}

export interface DemoProfileInfo {
  name: string;
  isDefault: boolean;
  model: string | null;
  gateway: string | null;
  alias: string | null;
  distribution: string | null;
}

export interface DemoEvent {
  type: string;
  at: string;
  data: Record<string, unknown>;
}

/** Injectable pause between streamed SSE frames. */
export type Delay = (ms: number) => Promise<void>;
