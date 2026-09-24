import { flag, parseArgs } from "../args.ts";
import { USAGE, fail, ok, type CliResult } from "../context.ts";

/** `hermes-remote audit tail [--lines 50]`: the newest audit entries. */
export async function auditCommand(args: string[], auditPath: string): Promise<CliResult> {
  const parsed = parseArgs(args);
  if (parsed.positionals[0] !== "tail") {
    return fail(`unknown audit action: ${parsed.positionals[0] ?? "(none)"}\n\n${USAGE}`);
  }
  const lines = Number(flag(parsed, "lines") ?? "50");
  if (!Number.isInteger(lines) || lines <= 0) {
    return fail(`invalid --lines: ${flag(parsed, "lines") as string}`);
  }
  const file = Bun.file(auditPath);
  if (!(await file.exists())) {
    return ok("no audit entries yet");
  }
  return ok((await file.text()).trimEnd().split("\n").slice(-lines).join("\n"));
}
