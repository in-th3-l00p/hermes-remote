import {
  AgentSessionsResource,
  BrowserResource,
  CommandsResource,
  EventsResource,
  GoalsResource,
  MediaResource,
  PassthroughResource,
  WebToolsResource,
} from "./agent-features.ts";
import { narrowChatEvent } from "./chat-event.ts";
import { Conversation } from "./conversation.ts";
import { DiscoveryResource } from "./discovery.ts";
import { HttpClient } from "./http.ts";
import { JobsResource } from "./jobs.ts";
import {
  AgentOpsResource,
  ApprovalsResource,
  BackupsResource,
  BundlesResource,
  CheckpointsResource,
  ConfigResource,
  GatewayResource,
  HooksResource,
  KanbanResource,
  McpResource,
  MemoryResource,
  MessagingResource,
  PairingResource,
  PluginsResource,
  ProfilesResource,
  ProjectsResource,
  ProvidersResource,
  SkillsResource,
  SoulResource,
  SubagentsResource,
  ToolsetsResource,
  WebhooksResource,
} from "./management.ts";
import { RunsResource } from "./runs.ts";
import type { HermesClientOptions } from "./http.ts";
import type {
  Attachment,
  ChatEvent,
  ChatMessage,
  ChatSession,
  ChatSessionMeta,
} from "./types.ts";

export interface SendMessageInput {
  content: string;
  attachments?: Attachment[];
}

export class HermesClient {
  readonly baseUrl: string;
  readonly discovery: DiscoveryResource;
  readonly runs: RunsResource;
  readonly jobs: JobsResource;
  readonly profiles: ProfilesResource;
  readonly config: ConfigResource;
  readonly providers: ProvidersResource;
  readonly agent: AgentOpsResource;
  readonly memory: MemoryResource;
  readonly soul: SoulResource;
  readonly skills: SkillsResource;
  readonly bundles: BundlesResource;
  readonly checkpoints: CheckpointsResource;
  readonly approvals: ApprovalsResource;
  readonly hooks: HooksResource;
  readonly webhooks: WebhooksResource;
  readonly gateway: GatewayResource;
  readonly messaging: MessagingResource;
  readonly pairing: PairingResource;
  readonly kanban: KanbanResource;
  readonly projects: ProjectsResource;
  readonly toolsets: ToolsetsResource;
  readonly mcp: McpResource;
  readonly plugins: PluginsResource;
  readonly backups: BackupsResource;
  readonly subagents: SubagentsResource;
  readonly agentSessions: AgentSessionsResource;
  readonly commands: CommandsResource;
  readonly goals: GoalsResource;
  readonly media: MediaResource;
  readonly web: WebToolsResource;
  readonly browser: BrowserResource;
  readonly events: EventsResource;
  readonly passthrough: PassthroughResource;
  private readonly http: HttpClient;
  private readonly options: HermesClientOptions;

  constructor(options: HermesClientOptions) {
    this.options = options;
    this.http = new HttpClient(options);
    this.baseUrl = this.http.baseUrl;
    this.discovery = new DiscoveryResource(this.http);
    this.runs = new RunsResource(this.http);
    this.jobs = new JobsResource(this.http);
    this.profiles = new ProfilesResource(this.http);
    this.config = new ConfigResource(this.http);
    this.providers = new ProvidersResource(this.http);
    this.agent = new AgentOpsResource(this.http);
    this.memory = new MemoryResource(this.http);
    this.soul = new SoulResource(this.http);
    this.skills = new SkillsResource(this.http);
    this.bundles = new BundlesResource(this.http);
    this.checkpoints = new CheckpointsResource(this.http);
    this.approvals = new ApprovalsResource(this.http);
    this.hooks = new HooksResource(this.http);
    this.webhooks = new WebhooksResource(this.http);
    this.gateway = new GatewayResource(this.http);
    this.messaging = new MessagingResource(this.http);
    this.pairing = new PairingResource(this.http);
    this.kanban = new KanbanResource(this.http);
    this.projects = new ProjectsResource(this.http);
    this.toolsets = new ToolsetsResource(this.http);
    this.mcp = new McpResource(this.http);
    this.plugins = new PluginsResource(this.http);
    this.backups = new BackupsResource(this.http);
    this.subagents = new SubagentsResource(this.http);
    this.agentSessions = new AgentSessionsResource(this.http);
    this.commands = new CommandsResource(this.http);
    this.goals = new GoalsResource(this.http);
    this.media = new MediaResource(this.http);
    this.web = new WebToolsResource(this.http);
    this.browser = new BrowserResource(this.http);
    this.events = new EventsResource(this.http);
    this.passthrough = new PassthroughResource(this.http);
  }

  /** A client bound to one hermes profile via the X-Hermes-Profile header. */
  withProfile(name: string): HermesClient {
    return new HermesClient({
      ...this.options,
      headers: { ...this.options.headers, "x-hermes-profile": name },
    });
  }

  /** A handle on one conversation; without an id, created on first send. */
  conversation(sessionId?: string): Conversation {
    return new Conversation(this, sessionId);
  }

  request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.http.request(method, path, body);
  }

  private async *stream(
    method: string,
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): AsyncIterable<ChatEvent> {
    for await (const event of this.http.stream(method, path, body, signal)) {
      const narrowed = narrowChatEvent(event);
      if (narrowed !== null) {
        yield narrowed;
      }
    }
  }

  status(): Promise<{ ok: boolean; version: string }> {
    return this.request("GET", "/v1/status");
  }

  createSession(): Promise<ChatSession> {
    return this.request("POST", "/v1/sessions", {});
  }

  async listSessions(ids?: string[]): Promise<ChatSessionMeta[]> {
    const query =
      ids === undefined || ids.length === 0
        ? ""
        : `?ids=${ids.map(encodeURIComponent).join(",")}`;
    const res = await this.request<{ sessions: ChatSessionMeta[] }>(
      "GET",
      `/v1/sessions${query}`,
    );
    return res.sessions;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request("DELETE", `/v1/sessions/${sessionId}`);
  }

  async listMessages(sessionId: string): Promise<ChatMessage[]> {
    const res = await this.request<{ messages: ChatMessage[] }>(
      "GET",
      `/v1/sessions/${sessionId}/messages`,
    );
    return res.messages;
  }

  sendMessage(
    sessionId: string,
    input: SendMessageInput,
    options: { signal?: AbortSignal } = {},
  ): AsyncIterable<ChatEvent> {
    return this.stream(
      "POST",
      `/v1/sessions/${sessionId}/messages`,
      { content: input.content, attachments: input.attachments ?? [] },
      options.signal,
    );
  }

  /** Aborts the in-flight agent turn; the partial reply is kept. */
  stopTurn(sessionId: string): Promise<{ stopped: boolean }> {
    return this.request("POST", `/v1/sessions/${sessionId}/stop`, {});
  }

  editMessage(
    sessionId: string,
    messageId: string,
    content: string,
    options: { signal?: AbortSignal } = {},
  ): AsyncIterable<ChatEvent> {
    return this.stream(
      "PATCH",
      `/v1/sessions/${sessionId}/messages/${messageId}`,
      { content },
      options.signal,
    );
  }

  react(
    sessionId: string,
    messageId: string,
    emoji: string,
  ): Promise<ChatMessage> {
    return this.request(
      "POST",
      `/v1/sessions/${sessionId}/messages/${messageId}/reactions`,
      { emoji },
    );
  }
}
