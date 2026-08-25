import { join } from "node:path";

export interface ConfigFile {
  port?: number;
  cors?: string[];
  anonymous?: boolean;
  upstreamUrl?: string;
  upstreamKey?: string;
  upstreamModel?: string;
  supabaseUrl?: string;
  supabaseJwtSecret?: string;
  rateLimit?: { limit: number; windowSeconds: number };
}

export function configPath(homeDir: string): string {
  return join(homeDir, "config.json");
}

export async function loadConfig(homeDir: string): Promise<ConfigFile> {
  const file = Bun.file(configPath(homeDir));
  if (!(await file.exists())) {
    return {};
  }
  try {
    return (await file.json()) as ConfigFile;
  } catch {
    return {};
  }
}
