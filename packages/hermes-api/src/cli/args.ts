export interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string[]>;
}

export function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string[]>();
  const push = (name: string, value: string): void => {
    const values = flags.get(name) ?? [];
    values.push(value);
    flags.set(name, values);
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      push(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      push(arg.slice(2), next);
      i += 1;
    } else {
      push(arg.slice(2), "true");
    }
  }
  return { positionals, flags };
}

export function flag(parsed: ParsedArgs, name: string): string | undefined {
  return parsed.flags.get(name)?.at(-1);
}

export function flagAll(parsed: ParsedArgs, name: string): string[] {
  return (parsed.flags.get(name) ?? []).flatMap((v) => v.split(","));
}

const DURATION_UNITS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDuration(text: string): number | null {
  const match = /^(\d+)([mhd])$/.exec(text);
  if (match === null) {
    return null;
  }
  return (
    Number(match[1]) * (DURATION_UNITS[match[2] as string] as number)
  );
}
