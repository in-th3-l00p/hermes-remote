import type { HttpClient } from "./http.ts";

export interface ProfileInfo {
  name: string;
  isDefault: boolean;
  model: string | null;
  gateway: string | null;
  alias: string | null;
  distribution: string | null;
}

export interface CliResult {
  ok: boolean;
  raw: string;
}

/** Hermes profile discovery and lifecycle (profiles:manage for mutations). */
export class ProfilesResource {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<ProfileInfo[]> {
    const res = await this.http.request<{ profiles: ProfileInfo[] }>(
      "GET",
      "/v1/profiles",
    );
    return res.profiles;
  }

  get(name: string): Promise<CliResult> {
    return this.http.request("GET", `/v1/profiles/${name}`);
  }

  create(name: string): Promise<CliResult> {
    return this.http.request("POST", "/v1/profiles", { name });
  }

  remove(name: string): Promise<CliResult> {
    return this.http.request("DELETE", `/v1/profiles/${name}`);
  }

  rename(name: string, to: string): Promise<CliResult> {
    return this.http.request("PATCH", `/v1/profiles/${name}`, { rename: to });
  }

  describe(name: string, description: string): Promise<CliResult> {
    return this.http.request("PATCH", `/v1/profiles/${name}`, { description });
  }

  exportArchive(name: string): Promise<Response> {
    return this.http.raw("POST", `/v1/profiles/${name}/export`);
  }

  importArchive(name: string, path: string): Promise<CliResult> {
    return this.http.request("POST", `/v1/profiles/${name}/import`, { path });
  }

  install(name: string, source: string): Promise<CliResult> {
    return this.http.request("POST", `/v1/profiles/${name}/install`, { source });
  }

  update(name: string): Promise<CliResult> {
    return this.http.request("POST", `/v1/profiles/${name}/update`);
  }
}

/** Agent configuration (config:read / config:write). */
export class ConfigResource {
  constructor(private readonly http: HttpClient) {}

  show(): Promise<CliResult> {
    return this.http.request("GET", "/v1/config");
  }

  get(key: string): Promise<CliResult> {
    return this.http.request("GET", `/v1/config/${key}`);
  }

  set(key: string, value: string): Promise<CliResult> {
    return this.http.request("PUT", `/v1/config/${key}`, { value });
  }

  unset(key: string): Promise<CliResult> {
    return this.http.request("DELETE", `/v1/config/${key}`);
  }

  check(): Promise<CliResult> {
    return this.http.request("POST", "/v1/config/check");
  }

  migrate(): Promise<CliResult> {
    return this.http.request("POST", "/v1/config/migrate");
  }
}

/** Model routing, fallbacks, MoA, credential pools. */
export class ProvidersResource {
  constructor(private readonly http: HttpClient) {}

  model(): Promise<CliResult> {
    return this.http.request("GET", "/v1/providers/model");
  }

  setModel(model: string): Promise<CliResult> {
    return this.http.request("PUT", "/v1/providers/model", { model });
  }

  fallbacks(): Promise<CliResult> {
    return this.http.request("GET", "/v1/providers/fallbacks");
  }

  setFallbacks(chain: string): Promise<CliResult> {
    return this.http.request("PUT", "/v1/providers/fallbacks", { chain });
  }

  moa(): Promise<CliResult> {
    return this.http.request("GET", "/v1/providers/moa");
  }

  setMoa(slots: string): Promise<CliResult> {
    return this.http.request("PUT", "/v1/providers/moa", { slots });
  }

  auth(): Promise<CliResult> {
    return this.http.request("GET", "/v1/providers/auth");
  }
}

function query(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    return "";
  }
  return `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}`;
}

/** Host-level agent operations and observability. */
export class AgentOpsResource {
  constructor(private readonly http: HttpClient) {}

  status(): Promise<CliResult> {
    return this.http.request("GET", "/v1/agent/status");
  }

  doctor(): Promise<CliResult> {
    return this.http.request("GET", "/v1/agent/doctor");
  }

  promptSize(): Promise<CliResult> {
    return this.http.request("GET", "/v1/agent/prompt-size");
  }

  securityAudit(): Promise<CliResult> {
    return this.http.request("GET", "/v1/agent/security-audit");
  }

  insights(options: { days?: number; source?: string } = {}): Promise<CliResult> {
    return this.http.request("GET", `/v1/insights${query(options)}`);
  }

  logs(
    options: { tail?: number; source?: string; filter?: string } = {},
  ): Promise<CliResult> {
    return this.http.request("GET", `/v1/logs${query(options)}`);
  }

  pause(): Promise<CliResult> {
    return this.http.request("POST", "/v1/agent/pause");
  }

  resume(): Promise<CliResult> {
    return this.http.request("POST", "/v1/agent/resume");
  }
}

export interface MemoryFile {
  content: string;
  chars: number;
  limit: number;
}

/** MEMORY.md / USER.md plus the journey timeline and providers. */
export class MemoryResource {
  constructor(private readonly http: HttpClient) {}

  get(): Promise<MemoryFile> {
    return this.http.request("GET", "/v1/memory");
  }

  set(content: string): Promise<MemoryFile> {
    return this.http.request("PUT", "/v1/memory", { content });
  }

  user(): Promise<MemoryFile> {
    return this.http.request("GET", "/v1/memory/user");
  }

  setUser(content: string): Promise<MemoryFile> {
    return this.http.request("PUT", "/v1/memory/user", { content });
  }

  add(text: string): Promise<MemoryFile> {
    return this.http.request("POST", "/v1/memory/entries", {
      action: "add",
      text,
    });
  }

  replace(from: string, text: string): Promise<MemoryFile> {
    return this.http.request("POST", "/v1/memory/entries", {
      action: "replace",
      from,
      text,
    });
  }

  remove(text: string): Promise<MemoryFile> {
    return this.http.request("POST", "/v1/memory/entries", {
      action: "remove",
      text,
    });
  }

  journey(): Promise<CliResult> {
    return this.http.request("GET", "/v1/memory/journey");
  }

  providers(): Promise<CliResult> {
    return this.http.request("GET", "/v1/memory/providers");
  }

  setProvider(provider: string): Promise<CliResult> {
    return this.http.request("PUT", "/v1/memory/providers", { provider });
  }
}

/** SOUL.md personality and skins. */
export class SoulResource {
  constructor(private readonly http: HttpClient) {}

  get(): Promise<{ content: string }> {
    return this.http.request("GET", "/v1/soul");
  }

  set(content: string): Promise<{ content: string }> {
    return this.http.request("PUT", "/v1/soul", { content });
  }

  skins(): Promise<CliResult> {
    return this.http.request("GET", "/v1/soul/skins");
  }

  setSkin(name: string): Promise<CliResult> {
    return this.http.request("PUT", "/v1/soul/skin", { name });
  }
}

export interface SkillFile {
  path: string;
  content: string;
}

/** Skill documents, hub lifecycle, approval gate, and curator. */
export class SkillsResource {
  constructor(private readonly http: HttpClient) {}

  list<T = unknown>(): Promise<T> {
    return this.http.request("GET", "/v1/skills");
  }

  get(name: string): Promise<{ name: string; content: string }> {
    return this.http.request("GET", `/v1/skills/${name}`);
  }

  create(name: string, content: string): Promise<{ name: string; content: string }> {
    return this.http.request("POST", "/v1/skills", { name, content });
  }

  patch(name: string, content: string): Promise<{ name: string; content: string }> {
    return this.http.request("PATCH", `/v1/skills/${name}`, { content });
  }

  remove(name: string): Promise<{ deleted: boolean }> {
    return this.http.request("DELETE", `/v1/skills/${name}`);
  }

  file(name: string, path: string): Promise<SkillFile> {
    return this.http.request("GET", `/v1/skills/${name}/files/${path}`);
  }

  writeFile(name: string, path: string, content: string): Promise<SkillFile> {
    return this.http.request("PUT", `/v1/skills/${name}/files/${path}`, {
      content,
    });
  }

  pending(): Promise<CliResult> {
    return this.http.request("GET", "/v1/skills/pending");
  }

  approve(id: string): Promise<CliResult> {
    return this.http.request("POST", `/v1/skills/pending/${id}/approve`);
  }

  reject(id: string): Promise<CliResult> {
    return this.http.request("POST", `/v1/skills/pending/${id}/reject`);
  }

  hubSearch(q: string, source?: string): Promise<CliResult> {
    return this.http.request("GET", `/v1/skills/hub/search${query({ q, source })}`);
  }

  hubInstall(source: string): Promise<CliResult> {
    return this.http.request("POST", "/v1/skills/hub/install", { source });
  }

  update(name: string): Promise<CliResult> {
    return this.http.request("POST", `/v1/skills/${name}/update`);
  }

  uninstall(name: string): Promise<CliResult> {
    return this.http.request("POST", `/v1/skills/${name}/uninstall`);
  }

  audit(name: string): Promise<CliResult> {
    return this.http.request("POST", `/v1/skills/${name}/audit`);
  }

  taps(): Promise<CliResult> {
    return this.http.request("GET", "/v1/skills/hub/taps");
  }

  addTap(url: string): Promise<CliResult> {
    return this.http.request("POST", "/v1/skills/hub/taps", { url });
  }

  removeTap(name: string): Promise<CliResult> {
    return this.http.request("DELETE", `/v1/skills/hub/taps/${name}`);
  }

  curator(): Promise<CliResult> {
    return this.http.request("GET", "/v1/skills/curator");
  }

  curatorRun(): Promise<CliResult> {
    return this.http.request("POST", "/v1/skills/curator/run");
  }

  curatorPause(): Promise<CliResult> {
    return this.http.request("POST", "/v1/skills/curator/pause");
  }
}

export interface Bundle {
  name: string;
  content: string;
}

export class BundlesResource {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<Bundle[]> {
    const res = await this.http.request<{ bundles: Bundle[] }>(
      "GET",
      "/v1/bundles",
    );
    return res.bundles;
  }

  get(name: string): Promise<Bundle> {
    return this.http.request("GET", `/v1/bundles/${name}`);
  }

  put(name: string, content: string): Promise<Bundle> {
    return this.http.request("PUT", `/v1/bundles/${name}`, { content });
  }

  remove(name: string): Promise<{ deleted: boolean }> {
    return this.http.request("DELETE", `/v1/bundles/${name}`);
  }
}

export class CheckpointsResource {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<CliResult> {
    return this.http.request("GET", "/v1/checkpoints");
  }

  prune(): Promise<CliResult> {
    return this.http.request("POST", "/v1/checkpoints/prune");
  }
}

export class ApprovalsResource {
  constructor(private readonly http: HttpClient) {}

  history(): Promise<CliResult> {
    return this.http.request("GET", "/v1/approvals");
  }

  propose(): Promise<CliResult> {
    return this.http.request("POST", "/v1/approvals/proposals");
  }
}

export class HooksResource {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<CliResult> {
    return this.http.request("GET", "/v1/hooks");
  }

  doctor(): Promise<CliResult> {
    return this.http.request("GET", "/v1/hooks/doctor");
  }

  test(event: string): Promise<CliResult> {
    return this.http.request("POST", `/v1/hooks/${event}/test`);
  }

  revokeConsent(command: string): Promise<CliResult> {
    return this.http.request("POST", "/v1/hooks/consent/revoke", { command });
  }
}

export class WebhooksResource {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<CliResult> {
    return this.http.request("GET", "/v1/webhooks/subscriptions");
  }

  add(url: string): Promise<CliResult> {
    return this.http.request("POST", "/v1/webhooks/subscriptions", { url });
  }

  remove(id: string): Promise<CliResult> {
    return this.http.request("DELETE", `/v1/webhooks/subscriptions/${id}`);
  }
}

export class GatewayResource {
  constructor(private readonly http: HttpClient) {}

  status(): Promise<CliResult> {
    return this.http.request("GET", "/v1/gateway");
  }

  platforms(): Promise<CliResult> {
    return this.http.request("GET", "/v1/gateway/platforms");
  }

  start(): Promise<CliResult> {
    return this.http.request("POST", "/v1/gateway/start");
  }

  stop(): Promise<CliResult> {
    return this.http.request("POST", "/v1/gateway/stop");
  }

  restart(): Promise<CliResult> {
    return this.http.request("POST", "/v1/gateway/restart");
  }

  enroll(): Promise<CliResult> {
    return this.http.request("POST", "/v1/gateway/enroll");
  }

  setPlatform(name: string, key: string, value: string): Promise<CliResult> {
    return this.http.request("PUT", `/v1/gateway/platforms/${name}`, {
      key,
      value,
    });
  }
}

export class MessagingResource {
  constructor(private readonly http: HttpClient) {}

  send(
    message: string,
    options: { platform?: string; target?: string } = {},
  ): Promise<CliResult> {
    return this.http.request("POST", "/v1/messages/send", {
      message,
      ...options,
    });
  }
}

export class PairingResource {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<CliResult> {
    return this.http.request("GET", "/v1/pairing/codes");
  }

  create(): Promise<CliResult> {
    return this.http.request("POST", "/v1/pairing/codes");
  }

  revoke(code: string): Promise<CliResult> {
    return this.http.request("DELETE", `/v1/pairing/codes/${code}`);
  }
}

export class KanbanResource {
  constructor(private readonly http: HttpClient) {}

  tasks(): Promise<CliResult> {
    return this.http.request("GET", "/v1/kanban/tasks");
  }

  add(title: string, options: { description?: string } = {}): Promise<CliResult> {
    return this.http.request("POST", "/v1/kanban/tasks", { title, ...options });
  }

  update(
    id: string,
    options: { status?: string; title?: string; assign?: string } = {},
  ): Promise<CliResult> {
    return this.http.request("PATCH", `/v1/kanban/tasks/${id}`, options);
  }

  remove(id: string): Promise<CliResult> {
    return this.http.request("DELETE", `/v1/kanban/tasks/${id}`);
  }

  comment(id: string, text: string): Promise<CliResult> {
    return this.http.request("POST", `/v1/kanban/tasks/${id}/comments`, { text });
  }
}

export class ProjectsResource {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<CliResult> {
    return this.http.request("GET", "/v1/projects");
  }

  add(name: string): Promise<CliResult> {
    return this.http.request("POST", "/v1/projects", { name });
  }

  update(name: string, options: { path?: string } = {}): Promise<CliResult> {
    return this.http.request("PATCH", `/v1/projects/${name}`, options);
  }

  remove(name: string): Promise<CliResult> {
    return this.http.request("DELETE", `/v1/projects/${name}`);
  }
}

export class ToolsetsResource {
  constructor(private readonly http: HttpClient) {}

  list<T = unknown>(): Promise<T> {
    return this.http.request("GET", "/v1/toolsets");
  }

  set(platform: string, name: string, enabled: boolean): Promise<CliResult> {
    return this.http.request("PUT", `/v1/toolsets/${platform}`, {
      name,
      enabled,
    });
  }
}

export class McpResource {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<CliResult> {
    return this.http.request("GET", "/v1/mcp");
  }

  add(name: string, url: string): Promise<CliResult> {
    return this.http.request("POST", "/v1/mcp", { name, url });
  }

  remove(name: string): Promise<CliResult> {
    return this.http.request("DELETE", `/v1/mcp/${name}`);
  }
}

export class PluginsResource {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<CliResult> {
    return this.http.request("GET", "/v1/plugins");
  }

  enable(name: string): Promise<CliResult> {
    return this.http.request("POST", `/v1/plugins/${name}/enable`);
  }

  disable(name: string): Promise<CliResult> {
    return this.http.request("POST", `/v1/plugins/${name}/disable`);
  }

  validate(name: string): Promise<CliResult> {
    return this.http.request("POST", `/v1/plugins/${name}/validate`);
  }
}

export class BackupsResource {
  constructor(private readonly http: HttpClient) {}

  create(): Promise<Response> {
    return this.http.raw("POST", "/v1/backups");
  }

  importArchive(path: string): Promise<CliResult> {
    return this.http.request("POST", "/v1/backups/import", { path });
  }
}

export class SubagentsResource {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<{ transcripts: string[] }> {
    return this.http.request("GET", "/v1/subagents");
  }
}
