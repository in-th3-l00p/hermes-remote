import { chmod, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AuthProviderConfig } from "@intheloop-studio/hermes-remote";

export interface ConfigFile {
  port?: number;
  /** Interface to listen on (default 127.0.0.1). */
  host?: string;
  cors?: string[];
  /** CIDRs of reverse proxies whose X-Forwarded-For is trusted. */
  trustProxy?: string[];
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
  const path = configPath(homeDir);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return { ok: true, config: {} };
  }
  // config.json can hold upstream keys and JWT secrets: owner-only.
  if (((await stat(path)).mode & 0o077) !== 0) {
    await chmod(path, 0o600);
  }
  try {
    return { ok: true, config: (await file.json()) as ConfigFile };
  } catch (error) {
    return { ok: false, error: `invalid config.json: ${(error as Error).message}` };
  }
}
