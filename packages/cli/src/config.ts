import { join } from "node:path";
import type { AuthProviderConfig } from "@in-th3-l00p/hermes-remote";

export interface ConfigFile {
  port?: number;
  cors?: string[];
  anonymous?: boolean;
  upstreamUrl?: string;
  upstreamKey?: string;
  upstreamModel?: string;
  auth?: AuthProviderConfig;
  /** Path to the hermes binary powering the management CLI bridge. */
  hermesBinary?: string;
  /** Per-profile home dir overrides; default ~/.hermes/profiles/<name>. */
  profileHomes?: Record<string, string>;
  /** Enables the slash-command relay once verified against the upstream. */
  commandRelay?: boolean;
  /** Legacy supabase settings, superseded by `auth`. */
  supabaseUrl?: string;
  supabaseJwtSecret?: string;
  rateLimit?: { limit: number; windowSeconds: number };
}

export type ConfigResult =
  | { ok: true; config: ConfigFile }
  | { ok: false; error: string };

export function configPath(homeDir: string): string {
  return join(homeDir, "config.json");
}

export async function loadConfig(homeDir: string): Promise<ConfigResult> {
  const file = Bun.file(configPath(homeDir));
  if (!(await file.exists())) {
    return { ok: true, config: {} };
  }
  try {
    return { ok: true, config: (await file.json()) as ConfigFile };
  } catch (error) {
    return { ok: false, error: `invalid config.json: ${(error as Error).message}` };
  }
}
