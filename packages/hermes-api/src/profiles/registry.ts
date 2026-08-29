import type { CliBridge } from "../bridge/index.ts";

export interface ProfileInfo {
  name: string;
  isDefault: boolean;
  model: string | null;
  gateway: string | null;
  alias: string | null;
  distribution: string | null;
}

export function profileArgs(profile: string | null | undefined): string[] {
  return profile == null ? [] : ["-p", profile];
}

function cell(value: string | undefined): string | null {
  return value === undefined || value === "—" || value === "" ? null : value;
}

function parseTable(stdout: string): ProfileInfo[] {
  const lines = stdout.split("\n");
  const separator = lines.findIndex((line) => line.includes("───"));
  if (separator === -1) {
    return [];
  }
  const profiles: ProfileInfo[] = [];
  for (const line of lines.slice(separator + 1)) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    const isDefault = trimmed.startsWith("◆");
    const columns = trimmed.replace(/^◆\s*/, "").split(/\s{2,}/);
    const name = columns[0];
    if (name === undefined || name === "") {
      continue;
    }
    profiles.push({
      name,
      isDefault,
      model: cell(columns[1]),
      gateway: cell(columns[2]),
      alias: cell(columns[3]),
      distribution: cell(columns[4]),
    });
  }
  return profiles;
}

/** Discovers hermes profiles via the CLI; results are briefly cached. */
export class ProfileRegistry {
  private readonly cli: CliBridge;
  private readonly homes: (name: string) => string;
  private readonly cacheMs: number;
  private readonly now: () => number;
  private cached: { at: number; profiles: ProfileInfo[] } | null = null;

  constructor(options: {
    cli: CliBridge;
    homeFor: (name: string) => string;
    cacheMs?: number;
    now?: () => number;
  }) {
    this.cli = options.cli;
    this.homes = options.homeFor;
    this.cacheMs = options.cacheMs ?? 15_000;
    this.now = options.now ?? (() => Date.now());
  }

  async list(): Promise<ProfileInfo[]> {
    const at = this.now();
    if (this.cached !== null && at - this.cached.at < this.cacheMs) {
      return this.cached.profiles;
    }
    const result = await this.cli.run(["profile", "list"]);
    const profiles = result.ok ? parseTable(result.stdout) : [];
    this.cached = { at, profiles };
    return profiles;
  }

  async exists(name: string): Promise<boolean> {
    return (await this.list()).some((p) => p.name === name);
  }

  homeFor(name: string): string {
    return this.homes(name);
  }
}
