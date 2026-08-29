import type { HttpClient } from "./http.ts";

export interface RemoteHealth {
  status: string;
  version: string;
  upstream: unknown;
}

export interface RemoteCapabilities {
  object: string;
  version: string;
  auth: { provider: string | null };
  anonymous: boolean;
  features: Record<string, boolean>;
  upstream: unknown;
}

/** Read-only agent discovery: health, capabilities, models, skills, toolsets. */
export class DiscoveryResource {
  constructor(private readonly http: HttpClient) {}

  health(): Promise<RemoteHealth> {
    return this.http.request("GET", "/v1/health");
  }

  capabilities(): Promise<RemoteCapabilities> {
    return this.http.request("GET", "/v1/capabilities");
  }

  models<T = unknown>(): Promise<T> {
    return this.http.request("GET", "/v1/models");
  }

  modelOptions<T = unknown>(): Promise<T> {
    return this.http.request("GET", "/v1/models/options");
  }

  skills<T = unknown>(): Promise<T> {
    return this.http.request("GET", "/v1/skills");
  }

  toolsets<T = unknown>(): Promise<T> {
    return this.http.request("GET", "/v1/toolsets");
  }
}
